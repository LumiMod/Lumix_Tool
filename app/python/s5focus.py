"""Backend for the S5 focus-sound desktop app.

Commands:
  status                         -> JSON device/table state
  dump                           -> JSON of all 28 sound-table entries
  apply <pcm-file> <samples>     -> upload PCM and retarget ID1 (focus beep)
  apply-id <id> <pcm> <samples>  -> alias for apply-slot
  apply-slot <index> <pcm> <samples> -> guarded per-entry RAM region
  restore                        -> restore the stock ID1 entry
  restore-id <id> <32-byte-hex>  -> restore any entry from a saved hex blob

All writes are RAM-only; a battery pull restores stock behaviour.
"""
import argparse
import json
import os
import struct
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
# Load the Windows-only transport only when needed; pure helpers work on any OS.
S = None


def protocol():
    global S
    if S is None:
        import s5svc
        S = s5svc
    return S

TBL = 0x86E35100
ID1 = TBL + 32
PCM_ADDR = 0x8F000100
PCM_VIRT = 0x0F000100
REGION_BASE = PCM_ADDR
REGION_STRIDE = 0x42000
HEADER_MAGIC = b"LMXTSLOT"
HEADER_SIZE = 16
SLOT_COUNT = 28
MAX_SAMPLES = 3 * 44100
ORIG_ID1 = bytes.fromhex(
    "010000008031aa06006aaa0680f5bf068066c00680380000b2ac310601000000"
)


def read_bytes(svc, addr, n):
    """0x5C reads need 1 KiB alignment; slice the wanted window out."""
    transport = protocol()
    aligned = addr & ~0x3FF
    skip = addr - aligned
    out = b""
    for off in range(0, skip + n, 1024):
        r = svc.exchange(transport.build_0x5c(aligned + off))
        if len(r) != 1030 or r[3] != 5:
            raise RuntimeError("read failed at 0x%X" % (aligned + off))
        out += r[4:1028]
    return out[skip:skip + n]


def validate_index(idx):
    if type(idx) is not int or not 0 <= idx < SLOT_COUNT:
        raise ValueError("index must be 0..27")
    return idx


def entry_addr(idx):
    return TBL + validate_index(idx) * 32


def region_addr(idx):
    return REGION_BASE + (validate_index(idx) + 1) * REGION_STRIDE


def encode_header(idx, samples):
    validate_index(idx)
    if type(samples) is not int or not 0 < samples <= MAX_SAMPLES:
        raise ValueError("sample count out of range")
    return struct.pack("<8sII", HEADER_MAGIC, idx, samples)


def decode_header(raw):
    if len(raw) < HEADER_SIZE:
        return None
    magic, idx, samples = struct.unpack_from("<8sII", raw)
    return (idx, samples) if magic == HEADER_MAGIC else None


def region_is_free(raw, idx):
    validate_index(idx)
    if len(raw) != REGION_STRIDE:
        return False
    header = decode_header(raw)
    return (header is not None and header[0] == idx) or raw == b"\x55" * REGION_STRIDE


class RegionNotFree(RuntimeError):
    def __init__(self, addr):
        super().__init__("region not free")
        self.address = "0x%08X" % addr


def guard_region(svc, idx):
    addr = region_addr(idx)
    if not region_is_free(read_bytes(svc, addr, REGION_STRIDE), idx):
        raise RegionNotFree(addr)
    return addr


def cmd_status():
    try:
        svc = protocol().Service(settle=0.002)
    except SystemExit as exc:
        print(json.dumps({"connected": False, "error": str(exc)}))
        return
    try:
        e = read_bytes(svc, ID1, 32)
        addr = struct.unpack_from("<I", e, 4)[0]
        size = struct.unpack_from("<I", e, 0x14)[0]
        ver = struct.unpack_from("<H", read_bytes(svc, 0x863B0000, 2), 0)[0]
        print(json.dumps({
            "connected": True,
            "id1_addr": "0x%08X" % addr,
            "id1_size": size,
            "custom": addr >= PCM_VIRT,
            "body_version": "0x%04X" % ver,
        }))
    except Exception as exc:
        print(json.dumps({"connected": True, "error": str(exc)}))
    finally:
        svc.close()


def cmd_dump():
    svc = protocol().Service(settle=0.002)
    try:
        out = []
        for i in range(28):
            e = read_bytes(svc, entry_addr(i), 32)
            out.append({
                "index": i,
                "id": struct.unpack_from("<I", e, 0)[0],
                "addr": "0x%08X" % struct.unpack_from("<I", e, 4)[0],
                "addr2": "0x%08X" % struct.unpack_from("<I", e, 8)[0],
                "size": struct.unpack_from("<I", e, 0x14)[0],
                "hex": e.hex(),
            })
        print(json.dumps({"ok": True, "entries": out}))
    finally:
        svc.close()


def write_halfwords(svc, addr, data):
    transport = protocol()
    for offset in range(0, len(data), 2):
        svc.exchange_write(transport.build_0x9c(addr + offset,
                                              struct.unpack_from("<H", data, offset)[0]))


def write_pcm(svc, path, samples, idx=1):
    # Validate all inputs before the guard, and guard the ENTIRE region before
    # writing even its header. Never infer free space from a small prefix.
    header = encode_header(idx, samples)
    with open(path, "rb") as source:
        data = source.read()
    if len(data) != samples * 2:
        raise RuntimeError("PCM size mismatch")
    addr = guard_region(svc, idx)
    write_halfwords(svc, addr, header)
    for i in range(samples):
        write_halfwords(svc, addr + HEADER_SIZE + i * 2, data[i * 2:i * 2 + 2])
        if (i + 1) % 2000 == 0 or i + 1 == samples:
            print("PROGRESS %d %d" % (i + 1, samples), flush=True)
    return addr + HEADER_SIZE - 0x80000000


def retarget(svc, idx, samples, pcm_virt):
    base = entry_addr(idx)
    write_halfwords(svc, base + 4, struct.pack("<I", pcm_virt))
    write_halfwords(svc, base + 0x14, struct.pack("<I", samples))
    return read_bytes(svc, base, 32)


def cmd_apply(path, samples, idx=1):
    encode_header(idx, samples)
    svc = protocol().Service(settle=0.002)
    try:
        pcm_virt = write_pcm(svc, path, samples, idx)
        e = retarget(svc, idx, samples, pcm_virt)
        ok = (struct.unpack_from("<I", e, 4)[0] == pcm_virt
              and struct.unpack_from("<I", e, 0x14)[0] == samples)
        print(json.dumps({"ok": ok, "index": idx, "entry": e.hex(),
                          "error": None if ok else "table verification failed"}))
    finally:
        svc.close()


def cmd_restore():
    svc = protocol().Service(settle=0.002)
    try:
        for i in range(0, 32, 2):
            svc.exchange_write(protocol().build_0x9c(ID1 + i,
                                            struct.unpack_from("<H", ORIG_ID1, i)[0]))
        e = read_bytes(svc, ID1, 32)
        print(json.dumps({"ok": e == ORIG_ID1, "entry": e.hex()}))
    finally:
        svc.close()


def cmd_restore_id(idx, hexblob):
    validate_index(idx)
    raw = bytes.fromhex(hexblob)
    if len(raw) != 32:
        raise SystemExit("entry hex must be 32 bytes")
    svc = protocol().Service(settle=0.002)
    try:
        base = entry_addr(idx)
        for i in range(0, 32, 2):
            svc.exchange_write(protocol().build_0x9c(base + i,
                                            struct.unpack_from("<H", raw, i)[0]))
        e = read_bytes(svc, base, 32)
        print(json.dumps({"ok": e == raw, "index": idx, "entry": e.hex()}))
    finally:
        svc.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["status", "dump", "apply", "apply-id", "apply-slot",
                                    "restore", "restore-id"])
    ap.add_argument("args", nargs="*")
    a = ap.parse_args()
    if a.cmd == "status":
        cmd_status()
    elif a.cmd == "dump":
        cmd_dump()
    elif a.cmd == "apply":
        cmd_apply(a.args[0], int(a.args[1]))
    elif a.cmd in ("apply-id", "apply-slot"):
        cmd_apply(a.args[1], int(a.args[2]), int(a.args[0]))
    elif a.cmd == "restore":
        cmd_restore()
    else:
        cmd_restore_id(int(a.args[0]), a.args[1])


if __name__ == "__main__":
    try:
        main()
    except (Exception, SystemExit) as exc:
        # argparse's normal --help exit remains successful.
        if isinstance(exc, SystemExit) and exc.code in (None, 0):
            raise
        result = {"ok": False, "error": str(exc)}
        if isinstance(exc, RegionNotFree):
            result["address"] = exc.address
        print(json.dumps(result), flush=True)
