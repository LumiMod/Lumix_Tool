"""Reduced-round AES-128 (Panasonic 5/10-round variant) for S5 firmware.

Implements encryption/decryption with a configurable number of rounds using the
standard AES-128 key schedule. Panasonic uses 5 rounds (not 10).

Usage:
  python tools/aes5.py test <firmware> [rounds]
"""
import sys, struct, hashlib

SBOX = [
    0x63,0x7c,0x77,0x7b,0xf2,0x6b,0x6f,0xc5,0x30,0x01,0x67,0x2b,0xfe,0xd7,0xab,0x76,
    0xca,0x82,0xc9,0x7d,0xfa,0x59,0x47,0xf0,0xad,0xd4,0xa2,0xaf,0x9c,0xa4,0x72,0xc0,
    0xb7,0xfd,0x93,0x26,0x36,0x3f,0xf7,0xcc,0x34,0xa5,0xe5,0xf1,0x71,0xd8,0x31,0x15,
    0x04,0xc7,0x23,0xc3,0x18,0x96,0x05,0x9a,0x07,0x12,0x80,0xe2,0xeb,0x27,0xb2,0x75,
    0x09,0x83,0x2c,0x1a,0x1b,0x6e,0x5a,0xa0,0x52,0x3b,0xd6,0xb3,0x29,0xe3,0x2f,0x84,
    0x53,0xd1,0x00,0xed,0x20,0xfc,0xb1,0x5b,0x6a,0xcb,0xbe,0x39,0x4a,0x4c,0x58,0xcf,
    0xd0,0xef,0xaa,0xfb,0x43,0x4d,0x33,0x85,0x45,0xf9,0x02,0x7f,0x50,0x3c,0x9f,0xa8,
    0x51,0xa3,0x40,0x8f,0x92,0x9d,0x38,0xf5,0xbc,0xb6,0xda,0x21,0x10,0xff,0xf3,0xd2,
    0xcd,0x0c,0x13,0xec,0x5f,0x97,0x44,0x17,0xc4,0xa7,0x7e,0x3d,0x64,0x5d,0x19,0x73,
    0x60,0x81,0x4f,0xdc,0x22,0x2a,0x90,0x88,0x46,0xee,0xb8,0x14,0xde,0x5e,0x0b,0xdb,
    0xe0,0x32,0x3a,0x0a,0x49,0x06,0x24,0x5c,0xc2,0xd3,0xac,0x62,0x91,0x95,0xe4,0x79,
    0xe7,0xc8,0x37,0x6d,0x8d,0xd5,0x4e,0xa9,0x6c,0x56,0xf4,0xea,0x65,0x7a,0xae,0x08,
    0xba,0x78,0x25,0x2e,0x1c,0xa6,0xb4,0xc6,0xe8,0xdd,0x74,0x1f,0x4b,0xbd,0x8b,0x8a,
    0x70,0x3e,0xb5,0x66,0x48,0x03,0xf6,0x0e,0x61,0x35,0x57,0xb9,0x86,0xc1,0x1d,0x9e,
    0xe1,0xf8,0x98,0x11,0x69,0xd9,0x8e,0x94,0x9b,0x1e,0x87,0xe9,0xce,0x55,0x28,0xdf,
    0x8c,0xa1,0x89,0x0d,0xbf,0xe6,0x42,0x68,0x41,0x99,0x2d,0x0f,0xb0,0x54,0xbb,0x16,
]
INV_SBOX = [0] * 256
for i, v in enumerate(SBOX):
    INV_SBOX[v] = i
RCON = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36]


def xtime(a):
    return ((a << 1) ^ 0x1b) & 0xff if a & 0x80 else (a << 1) & 0xff


def mul(a, b):
    r = 0
    for _ in range(8):
        if b & 1:
            r ^= a
        a = xtime(a)
        b >>= 1
    return r


def expand_key(key):
    w = [list(key[i * 4:i * 4 + 4]) for i in range(4)]
    for i in range(4, 44):
        t = list(w[i - 1])
        if i % 4 == 0:
            t = t[1:] + t[:1]
            t = [SBOX[x] for x in t]
            t[0] ^= RCON[i // 4 - 1]
        w.append([w[i - 4][j] ^ t[j] for j in range(4)])
    return [sum(w[4 * r:4 * r + 4], []) for r in range(11)]


def add_rk(s, rk):
    return [s[i] ^ rk[i] for i in range(16)]


def sub_bytes(s, box):
    return [box[x] for x in s]


def shift_rows(s):
    out = [0] * 16
    for c in range(4):
        for r in range(4):
            out[c * 4 + r] = s[((c + r) % 4) * 4 + r]
    return out


def inv_shift_rows(s):
    out = [0] * 16
    for c in range(4):
        for r in range(4):
            out[c * 4 + r] = s[((c - r) % 4) * 4 + r]
    return out


def mix_columns(s):
    out = [0] * 16
    for c in range(4):
        a = s[c * 4:c * 4 + 4]
        out[c * 4 + 0] = mul(a[0], 2) ^ mul(a[1], 3) ^ a[2] ^ a[3]
        out[c * 4 + 1] = a[0] ^ mul(a[1], 2) ^ mul(a[2], 3) ^ a[3]
        out[c * 4 + 2] = a[0] ^ a[1] ^ mul(a[2], 2) ^ mul(a[3], 3)
        out[c * 4 + 3] = mul(a[0], 3) ^ a[1] ^ a[2] ^ mul(a[3], 2)
    return out


def inv_mix_columns(s):
    out = [0] * 16
    for c in range(4):
        a = s[c * 4:c * 4 + 4]
        out[c * 4 + 0] = mul(a[0], 14) ^ mul(a[1], 11) ^ mul(a[2], 13) ^ mul(a[3], 9)
        out[c * 4 + 1] = mul(a[0], 9) ^ mul(a[1], 14) ^ mul(a[2], 11) ^ mul(a[3], 13)
        out[c * 4 + 2] = mul(a[0], 13) ^ mul(a[1], 9) ^ mul(a[2], 14) ^ mul(a[3], 11)
        out[c * 4 + 3] = mul(a[0], 11) ^ mul(a[1], 13) ^ mul(a[2], 9) ^ mul(a[3], 14)
    return out


def encrypt_block(pt, rk, rounds):
    s = add_rk(list(pt), rk[0])
    for r in range(1, rounds):
        s = sub_bytes(s, SBOX)
        s = shift_rows(s)
        s = mix_columns(s)
        s = add_rk(s, rk[r])
    s = sub_bytes(s, SBOX)
    s = shift_rows(s)
    s = add_rk(s, rk[rounds])
    return bytes(s)


def decrypt_block(ct, rk, rounds):
    s = add_rk(list(ct), rk[rounds])
    for r in range(rounds - 1, 0, -1):
        s = inv_shift_rows(s)
        s = sub_bytes(s, INV_SBOX)
        s = add_rk(s, rk[r])
        s = inv_mix_columns(s)
    s = inv_shift_rows(s)
    s = sub_bytes(s, INV_SBOX)
    s = add_rk(s, rk[0])
    return bytes(s)


def cbc_decrypt(ct, key, iv, rounds):
    rk = expand_key(key)
    out = bytearray()
    prev = iv
    for i in range(0, len(ct) - len(ct) % 16, 16):
        blk = ct[i:i + 16]
        p = decrypt_block(blk, rk, rounds)
        out += bytes(a ^ b for a, b in zip(p, prev))
        prev = blk
    return bytes(out)


def cbc_encrypt(pt, key, iv, rounds):
    rk = expand_key(key)
    out = bytearray()
    prev = iv
    for i in range(0, len(pt) - len(pt) % 16, 16):
        blk = bytes(a ^ b for a, b in zip(pt[i:i + 16], prev))
        c = encrypt_block(blk, rk, rounds)
        out += c
        prev = c
    return bytes(out)


def test(fw_path, key_hex, rounds_list):
    sys.path.insert(0, 'tools')
    import lumixupd as L
    b = L.load(fw_path)
    recs = L.records(b)
    ds = L.data_start(b)
    key = bytes.fromhex(key_hex)
    results = []
    cur = ds
    for r in recs:
        blob = bytes(b[cur:cur + r['size']])
        cur += r['size']
        if r['flags'] != 3:
            continue
        for rounds in rounds_list:
            pt = cbc_decrypt(blob, key, r['iv'], rounds)
            ok = hashlib.sha256(pt[:r['size']]).digest() == r['sha']
            results.append((r['name'], rounds, ok))
    return results


if __name__ == '__main__':
    if len(sys.argv) >= 3 and sys.argv[1] == 'test':
        fw = sys.argv[2]
        key = sys.argv[3] if len(sys.argv) > 3 else '194364775255595d04e48de2b15e5c2c'
        rounds = [int(x) for x in sys.argv[4].split(',')] if len(sys.argv) > 4 else [5, 10]
        res = test(fw, key, rounds)
        for name, rounds, ok in res:
            print('%-12s rounds=%-2d sha256 match=%s' % (name, rounds, ok))
        print('---')
        for rd in rounds:
            n = sum(1 for _, x, ok in res if x == rd and ok)
            print('rounds=%d: %d/%d verified' % (rd, n, sum(1 for _, x, _ in res if x == rd)))
    else:
        print(__doc__)
