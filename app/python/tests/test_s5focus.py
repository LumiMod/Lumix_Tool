"""RAM safety tests, independent of Windows/WinUSB and camera hardware."""
import contextlib
import io
import json
import os
import runpy
import struct
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import s5focus as focus


class FakeService:
    def __init__(self):
        self.memory = {}
        self.reads = []
        self.writes = []
        self.closed = False

    def put(self, address, data):
        self.memory.update((address + i, value) for i, value in enumerate(data))

    def get(self, address, size):
        return bytes(self.memory.get(address + i, 0x55) for i in range(size))

    def exchange(self, address):
        assert address % 1024 == 0
        self.reads.append(address)
        return b'\x01\x00\xff\x05' + self.get(address, 1024) + b'\x00\x00'

    def exchange_write(self, item):
        address, value = item
        self.writes.append(item)
        self.put(address, struct.pack('<H', value))

    def close(self):
        self.closed = True


class SlotTests(unittest.TestCase):
    def setUp(self):
        self.svc = FakeService()
        self.transport = types.SimpleNamespace(
            build_0x5c=lambda addr: addr,
            build_0x9c=lambda addr, value: (addr, value),
            Service=lambda **kwargs: self.svc,
        )
        self.patcher = patch.object(focus, 'S', self.transport)
        self.patcher.start()
        self.addCleanup(self.patcher.stop)
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.pcm = os.path.join(self.directory.name, 'test.pcm')
        with open(self.pcm, 'wb') as target:
            target.write(b'\x01\x00\xff\x7f')

    def test_addresses_skip_legacy_region_and_never_overlap(self):
        self.assertEqual(focus.region_addr(0), 0x8F042100)
        self.assertEqual(focus.region_addr(1), 0x8F084100)
        self.assertEqual(focus.region_addr(27), 0x8F738100)
        for index in range(27):
            self.assertLessEqual(focus.region_addr(index) + 16 + focus.MAX_SAMPLES * 2,
                                 focus.region_addr(index + 1))
        for index in [-1, 28, 1.5, True]:
            with self.assertRaises(ValueError):
                focus.region_addr(index)

    def test_header_is_exactly_16_bytes_little_endian(self):
        raw = focus.encode_header(7, 132300)
        self.assertEqual(raw, b'LMXTSLOT' + struct.pack('<II', 7, 132300))
        self.assertEqual(focus.decode_header(raw), (7, 132300))
        self.assertIsNone(focus.decode_header(raw[:15]))
        self.assertIsNone(focus.decode_header(b'X' + raw[1:]))
        for samples in [0, -1, 132301, 1.5, True]:
            with self.assertRaises(ValueError):
                focus.encode_header(7, samples)

    def test_guard_decision_checks_full_region_and_owner(self):
        free = b'\x55' * focus.REGION_STRIDE
        self.assertTrue(focus.region_is_free(free, 2))
        self.assertFalse(focus.region_is_free(free[:-1] + b'\x00', 2))
        self.assertFalse(focus.region_is_free(free[:-1], 2))
        owned = focus.encode_header(2, 2) + bytes(focus.REGION_STRIDE - 16)
        self.assertTrue(focus.region_is_free(owned, 2))
        self.assertFalse(focus.region_is_free(owned, 3))

    def test_occupied_tail_refuses_before_any_write(self):
        addr = focus.region_addr(20)
        self.svc.put(addr + focus.REGION_STRIDE - 1, b'\x00')
        with self.assertRaises(focus.RegionNotFree) as raised:
            focus.cmd_apply(self.pcm, 2, 20)
        self.assertEqual(str(raised.exception), 'region not free')
        self.assertEqual(raised.exception.address, '0x%08X' % addr)
        self.assertEqual(self.svc.writes, [])
        self.assertTrue(self.svc.closed)
        self.assertEqual(len(self.svc.reads), focus.REGION_STRIDE // 1024 + 1)
        self.assertEqual(self.svc.reads[-1], (addr + focus.REGION_STRIDE - 1) & ~1023)

    def test_two_uploads_are_independent_and_only_retarget_two_fields(self):
        original = struct.pack('<8I', 1, 0x06AA3180, 3, 4, 5, 14464, 7, 8)
        for index in [1, 4]:
            self.svc.put(focus.entry_addr(index), original)
            with contextlib.redirect_stdout(io.StringIO()) as output:
                focus.cmd_apply(self.pcm, 2, index)
            lines = output.getvalue().splitlines()
            self.assertEqual(lines[0], 'PROGRESS 2 2')
            self.assertTrue(json.loads(lines[-1])['ok'])
            addr = focus.region_addr(index)
            self.assertEqual(self.svc.get(addr, 16), focus.encode_header(index, 2))
            self.assertEqual(self.svc.get(addr + 16, 4), b'\x01\x00\xff\x7f')
            actual = self.svc.get(focus.entry_addr(index), 32)
            expected = bytearray(original)
            struct.pack_into('<I', expected, 4, addr + 16 - 0x80000000)
            struct.pack_into('<I', expected, 0x14, 2)
            self.assertEqual(actual, expected)
        self.assertTrue(all(addr >= focus.region_addr(0) or addr < focus.REGION_BASE
                            for addr, _ in self.svc.writes))

    def test_owned_region_can_be_reused_but_wrong_owner_cannot(self):
        addr = focus.region_addr(3)
        self.svc.put(addr, focus.encode_header(2, 2))
        with self.assertRaises(focus.RegionNotFree):
            focus.write_pcm(self.svc, self.pcm, 2, 3)
        self.assertEqual(self.svc.writes, [])
        self.svc.put(addr, focus.encode_header(3, 2))
        with contextlib.redirect_stdout(io.StringIO()):
            focus.write_pcm(self.svc, self.pcm, 2, 3)
        self.assertTrue(self.svc.writes)

    def test_read_failure_and_invalid_pcm_never_write(self):
        with self.assertRaises(RuntimeError):
            focus.write_pcm(self.svc, self.pcm, 3, 2)
        self.svc.exchange = lambda addr: b'bad frame'
        with self.assertRaises(RuntimeError):
            focus.write_pcm(self.svc, self.pcm, 2, 2)
        self.assertEqual(self.svc.writes, [])

    def test_restore_id_round_trips_saved_entry(self):
        raw = bytes(range(32))
        with contextlib.redirect_stdout(io.StringIO()) as output:
            focus.cmd_restore_id(27, raw.hex())
        self.assertTrue(json.loads(output.getvalue())['ok'])
        self.assertEqual(self.svc.get(focus.entry_addr(27), 32), raw)
        self.assertEqual(len(self.svc.writes), 16)

    def test_cli_region_error_is_one_json_line_and_no_writes(self):
        addr = focus.region_addr(20)
        self.svc.put(addr + focus.REGION_STRIDE - 1, b'\x00')
        with patch.dict(sys.modules, {'s5svc': self.transport}), \
                patch.object(sys, 'argv', ['s5focus.py', 'apply-slot', '20', self.pcm, '2']), \
                contextlib.redirect_stdout(io.StringIO()) as output:
            runpy.run_path(focus.__file__, run_name='__main__')
        lines = output.getvalue().splitlines()
        self.assertEqual(len(lines), 1)
        self.assertEqual(json.loads(lines[0]), {
            'ok': False, 'error': 'region not free', 'address': '0x%08X' % addr,
        })
        self.assertEqual(self.svc.writes, [])

    def test_legacy_cli_apply_and_apply_id_use_independent_regions(self):
        for arguments, index in [(['apply', self.pcm, '2'], 1),
                                 (['apply-id', '4', self.pcm, '2'], 4)]:
            with self.subTest(command=arguments[0]), \
                    patch.dict(sys.modules, {'s5svc': self.transport}), \
                    patch.object(sys, 'argv', ['s5focus.py'] + arguments), \
                    contextlib.redirect_stdout(io.StringIO()) as output:
                runpy.run_path(focus.__file__, run_name='__main__')
            self.assertTrue(json.loads(output.getvalue().splitlines()[-1])['ok'])
            self.assertEqual(self.svc.get(focus.region_addr(index), 16),
                             focus.encode_header(index, 2))


if __name__ == '__main__':
    unittest.main()
