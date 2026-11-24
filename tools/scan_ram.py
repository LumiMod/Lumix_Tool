"""Scan camera RAM (via the service protocol) for 32-bit values.

Usage:
  python tools/scan_ram.py 0x88000000 0x8C000000 0x863CA4C1 [more values...]

Reads 1 KiB blocks and reports every block containing any of the values.
"""
import sys, struct, json, time

sys.path.insert(0, 'tools')
import s5svc as S


def main():
    if len(sys.argv) < 4:
        print('usage: scan_ram.py <start> <end> <value> [value...]')
        return 1
    start = int(sys.argv[1], 16) & ~0x3FF
    end = int(sys.argv[2], 16)
    values = [int(v, 16) for v in sys.argv[3:]]
    patterns = [struct.pack('<I', v) for v in values]

    svc = S.Service(settle=0.002)
    hits = []
    block = 1024
    total = (end - start) // block
    t0 = time.time()
    try:
        for i in range(total):
            addr = start + i * block
            try:
                r = svc.exchange(S.build_0x5c(addr))
            except Exception as exc:
                print(json.dumps({'error': str(exc)[:80], 'at': hex(addr)}), flush=True)
                break
            data = r[4:1028]
            for idx, pat in enumerate(patterns):
                pos = data.find(pat)
                if pos >= 0:
                    hits.append({'addr': hex(addr + pos), 'value': hex(values[idx])})
            if (i + 1) % 2048 == 0:
                print(json.dumps({'progress': i + 1, 'total': total,
                                  'elapsed': round(time.time() - t0, 1)}), flush=True)
        print(json.dumps({'ok': True, 'hits': hits, 'scanned': total,
                          'elapsed': round(time.time() - t0, 1)}))
    finally:
        svc.close()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
