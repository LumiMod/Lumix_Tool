"""Backend for the S5 focus-sound desktop app.

Commands:
  status                     -> JSON device/table state
  apply <pcm-file> <samples> -> upload PCM to the free RAM area and retarget ID1
  restore                    -> restore the stock ID1 entry

All writes are RAM-only; a battery pull restores stock behaviour.
"""
import argparse
import json
import os
import struct
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import s5svc as S

TBL = 0x86E35100
ID1 = TBL + 32
PCM_ADDR = 0x8F000100
PCM_VIRT = 0x0F000100
MAX_SAMPLES = 3 * 44100
ORIG_ID1 = bytes.fromhex(
    "010000008031aa06006aaa0680f5bf068066c00680380000b2ac310601000000"
)


def read_bytes(svc, addr, n):
    """0x5C reads need 1 KiB alignment; slice the wanted window out."""
    aligned = addr & ~0x3FF
    skip = addr - aligned
    out = b""
    for off in range(0, skip + n, 1024):
        r = svc.exchange(S.build_0x5c(aligned + off))
        if len(r) != 1030 or r[3] != 5:
            raise RuntimeError("read failed at 0x%X" % (aligned + off))
        out += r[4:1028]
    return out[skip:skip + n]


def cmd_status():
    try:
        svc = S.Service(settle=0.002)
    except SystemExit:
        print(json.dumps({"connected": False}))
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
            "custom": addr == PCM_VIRT,
            "body_version": "0x%04X" % ver,
        }))
    except Exception as exc:
        print(json.dumps({"connected": True, "error": str(exc)}))
    finally:
        svc.close()


def cmd_apply(path, samples):
    data = open(path, "rb").read()
    if len(data) != samples * 2:
        print(json.dumps({"ok": False, "error": "PCM size mismatch"}))
        return
    if samples <= 0 or samples > MAX_SAMPLES:
        print(json.dumps({"ok": False, "error": "sample count out of range"}))
        return
    svc = S.Service(settle=0.002)
    try:
        total = samples
        for i in range(total):
            v = struct.unpack_from("<H", data, i * 2)[0]
            svc.exchange_write(S.build_0x9c(PCM_ADDR + i * 2, v))
            if (i + 1) % 2000 == 0:
                print("PROGRESS %d %d" % (i + 1, total), flush=True)
        # retarget ID1
        svc.exchange_write(S.build_0x9c(ID1 + 4, PCM_VIRT & 0xFFFF))
        svc.exchange_write(S.build_0x9c(ID1 + 6, (PCM_VIRT >> 16) & 0xFFFF))
        svc.exchange_write(S.build_0x9c(ID1 + 0x14, samples & 0xFFFF))
        svc.exchange_write(S.build_0x9c(ID1 + 0x16, (samples >> 16) & 0xFFFF))
        e = read_bytes(svc, ID1, 32)
        ok = (struct.unpack_from("<I", e, 4)[0] == PCM_VIRT
              and struct.unpack_from("<I", e, 0x14)[0] == samples)
        print(json.dumps({"ok": ok, "entry": e.hex()}))
    finally:
        svc.close()


def cmd_restore():
    svc = S.Service(settle=0.002)
    try:
        for i in range(0, 32, 2):
            svc.exchange_write(S.build_0x9c(ID1 + i, struct.unpack_from("<H", ORIG_ID1, i)[0]))
        e = read_bytes(svc, ID1, 32)
        print(json.dumps({"ok": e == ORIG_ID1, "entry": e.hex()}))
    finally:
        svc.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["status", "apply", "restore"])
    ap.add_argument("args", nargs="*")
    a = ap.parse_args()
    if a.cmd == "status":
        cmd_status()
    elif a.cmd == "apply":
        cmd_apply(a.args[0], int(a.args[1]))
    else:
        cmd_restore()


if __name__ == "__main__":
    main()
