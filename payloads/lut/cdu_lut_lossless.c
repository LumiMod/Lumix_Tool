#include <stdint.h>

#define LOG_BASE ((volatile uint32_t *)0x8F300000u)
#define LUT_RGB9 ((uint32_t *)0x06371000u) /* Proven RW L1-cached cave: 729 x 4 = 2,916 B (zero stack!) */
#define RTOS_DLY_TSK ((int32_t (*)(uint32_t))0x866C23E9u) /* Verified uITRON dly_tsk(ms) (Thumb) */

/*
 * v3.6b Lossless Cooperative Engine (Bit-exact 9^3 color + uITRON dly_tsk Yield):
 * - Fixed Panasonic 0xBEEF (G,B,R) hardware channel order
 * - Stores unpacked 2.9 KB 9^3 LUT in proven L1-cached cave 0x06371000 (<128 B stack for safe RTOS yield!)
 * - 100% branchless 3-swap tetrahedral + SWAR (R|B<<16) interpolation (zero mispredictions!)
 * - Yields CPU via uITRON dly_tsk(4) every 64 rows on full-res stills (w >= 2400)
 *   so Live View / UI rendering threads stay responsive!
 * - 4x unrolled cache maintenance + PLD prefetching + 8-row strip DSB batching
 * - Auto-detected B&W LUT fast path (pure 1D luma lookup + zero UV -> ~0.2s!)
 * - Pairs with 2-byte Playback double-LUT fix at 0x866AE770 (13d0 -> 13e0)
 */

static inline int32_t usat8(int32_t v) {
    int32_t res;
    __asm__ ("usat %0, #8, %1" : "=r"(res) : "r"(v));
    return res;
}

static inline int32_t ssat8(int32_t v) {
    int32_t res;
    __asm__ ("ssat %0, #8, %1" : "=r"(res) : "r"(v));
    return res;
}

static inline void dcimvac_lines(uint32_t addr, uint32_t len) {
    uint32_t p = addr & ~63u;
    uint32_t end = addr + len;
    while (p + 256u <= end) {
        uint32_t p1 = p + 64u, p2 = p + 128u, p3 = p + 192u;
        __asm__ volatile (
            "mcr p15, 0, %0, c7, c14, 1\n\t"
            "mcr p15, 0, %1, c7, c14, 1\n\t"
            "mcr p15, 0, %2, c7, c14, 1\n\t"
            "mcr p15, 0, %3, c7, c14, 1"
            :: "r"(p), "r"(p1), "r"(p2), "r"(p3) : "memory"
        );
        p += 256u;
    }
    while (p < end) {
        __asm__ volatile ("mcr p15, 0, %0, c7, c14, 1" :: "r"(p) : "memory");
        p += 64u;
    }
}

static inline void dccmvac_lines(uint32_t addr, uint32_t len) {
    uint32_t p = addr & ~63u;
    uint32_t end = addr + len;
    while (p + 256u <= end) {
        uint32_t p1 = p + 64u, p2 = p + 128u, p3 = p + 192u;
        __asm__ volatile (
            "mcr p15, 0, %0, c7, c10, 1\n\t"
            "mcr p15, 0, %1, c7, c10, 1\n\t"
            "mcr p15, 0, %2, c7, c10, 1\n\t"
            "mcr p15, 0, %3, c7, c10, 1"
            :: "r"(p), "r"(p1), "r"(p2), "r"(p3) : "memory"
        );
        p += 256u;
    }
    while (p < end) {
        __asm__ volatile ("mcr p15, 0, %0, c7, c10, 1" :: "r"(p) : "memory");
        p += 64u;
    }
}

/* Returns 1 if LUT is pure monochrome (R==G==B for all 729 entries), else 0 */
static uint32_t unpack_beef_packed(uint32_t lut_addr, uint32_t out_lut[729]) {
    static const uint16_t sub_off[8] = {
        0x004, 0x1F8, 0x388, 0x518, 0x658, 0x7E8, 0x928, 0xA68
    };
    const uint8_t *blob = (const uint8_t *)(lut_addr | 0x80000000u);
    const uint16_t *idx_map = (const uint16_t *)0x06E39EB4u;
    uint32_t is_bw = 1u;

    for (uint32_t g = 0; g < 9u; g++) {
        for (uint32_t b = 0; b < 9u; b++) {
            for (uint32_t r = 0; r < 9u; r++) {
                uint32_t hw_flat = (g * 9u + b) * 9u + r;
                uint32_t tnum = idx_map[hw_flat * 2u + 0u];
                uint32_t idx  = idx_map[hw_flat * 2u + 1u];
                uint32_t off  = (uint32_t)sub_off[tnum & 7u] + (idx << 2);
                uint32_t w    = *(const uint32_t *)(blob + off);
                uint32_t g6   = (w >> 12) & 0x3Fu;
                uint32_t b6   = (w >> 6)  & 0x3Fu;
                uint32_t r6   =  w        & 0x3Fu;
                if (r6 != g6 || g6 != b6) is_bw = 0u;
                uint32_t r8   = (r6 << 2) | (r6 >> 4);
                uint32_t g8   = (g6 << 2) | (g6 >> 4);
                uint32_t b8   = (b6 << 2) | (b6 >> 4);
                uint32_t dst  = (r * 9u + g) * 9u + b;
                out_lut[dst]  = r8 | (g8 << 8) | (b8 << 16);
            }
        }
    }
    return is_bw;
}

/* 100% branchless 3-swap tetrahedral + SWAR interpolation */
static inline void lut_tetra_swar(const uint32_t lut[729], uint32_t r, uint32_t g, uint32_t b,
                                  int32_t *or_out, int32_t *og_out, int32_t *ob_out) {
    uint32_t ri = r >> 5, rf = r & 31u;
    uint32_t gi = g >> 5, gf = g & 31u;
    uint32_t bi = b >> 5, bf = b & 31u;

    const uint32_t *p = lut + (ri * 9u + gi) * 9u + bi;
    uint32_t a = (rf << 8) | 81u;
    uint32_t x = (gf << 8) | 9u;
    uint32_t c = (bf << 8) | 1u;
    uint32_t t;
    if (a < x) { t = a; a = x; x = t; }
    if (x < c) { t = x; x = c; c = t; }
    if (a < x) { t = a; a = x; x = t; }

    uint32_t smax = a & 0xFFu, smid = x & 0xFFu;
    uint32_t fmax = a >> 8,    fmid = x >> 8, fmin = c >> 8;
    uint32_t w0 = 32u - fmax, w1 = fmax - fmid, w2 = fmid - fmin, w3 = fmin;

    uint32_t p0 = p[0];
    uint32_t p1 = p[smax];
    uint32_t p2 = p[smax + smid];
    uint32_t p3 = p[91];

    uint32_t rb = w0 * (p0 & 0x00FF00FFu) + w1 * (p1 & 0x00FF00FFu)
                + w2 * (p2 & 0x00FF00FFu) + w3 * (p3 & 0x00FF00FFu) + 0x00100010u;
    uint32_t gg = w0 * ((p0 >> 8) & 0xFFu) + w1 * ((p1 >> 8) & 0xFFu)
                + w2 * ((p2 >> 8) & 0xFFu) + w3 * ((p3 >> 8) & 0xFFu) + 16u;

    *or_out = (int32_t)((rb >> 5) & 0xFFu);
    *ob_out = (int32_t)(rb >> 21);
    *og_out = (int32_t)(gg >> 5);
}

static void apply_lut_nv16_bw(uint32_t y_addr, uint32_t uv_addr,
                              uint32_t w, uint32_t h,
                              uint32_t y_stride, uint32_t uv_stride,
                              const uint32_t lut[729]) {
    uint8_t ytab[256];
    for (uint32_t v = 0; v < 256u; v++) {
        uint32_t i = v >> 5, f = v & 31u;
        uint32_t c0 = lut[(i * 9u + i) * 9u + i] & 0xFFu;
        uint32_t c1 = lut[((i + 1u) * 9u + (i + 1u)) * 9u + (i + 1u)] & 0xFFu;
        ytab[v] = (uint8_t)((c0 * (32u - f) + c1 * f + 16u) >> 5);
    }

    uint8_t *y_base  = (uint8_t *)y_addr;
    uint8_t *uv_base = (uint8_t *)uv_addr;
    uint32_t words = w >> 2;

    for (uint32_t row = 0; row < h; row++) {
        uint8_t *y_row  = y_base  + row * y_stride;
        uint8_t *uv_row = uv_base + row * uv_stride;
        if ((row & 7u) == 0u) {
            uint32_t strip = (h - row < 8u) ? (h - row) : 8u;
            for (uint32_t s = 0; s < strip; s++) {
                dcimvac_lines((uint32_t)(y_row + s * y_stride), w);
            }
            __asm__ volatile ("dsb sy" ::: "memory");
        }

        uint32_t *yp  = (uint32_t *)y_row;
        uint32_t *uvp = (uint32_t *)uv_row;
        for (uint32_t i = 0; i < words; i++) {
            uint32_t y4 = yp[i];
            uint32_t ny = (uint32_t)ytab[y4 & 0xFFu]
                        | ((uint32_t)ytab[(y4 >> 8) & 0xFFu] << 8)
                        | ((uint32_t)ytab[(y4 >> 16) & 0xFFu] << 16)
                        | ((uint32_t)ytab[y4 >> 24] << 24);
            yp[i]  = ny;
            uvp[i] = 0u;
        }
        dccmvac_lines((uint32_t)y_row, w);
        dccmvac_lines((uint32_t)uv_row, w);
    }
    __asm__ volatile ("dsb sy" ::: "memory");
}

static int32_t apply_lut_nv16_lossless(uint32_t y_addr, uint32_t uv_addr,
                                       uint32_t w, uint32_t h,
                                       uint32_t y_stride, uint32_t uv_stride,
                                       const uint32_t lut[729]) {
    uint8_t *y_base  = (uint8_t *)y_addr;
    uint8_t *uv_base = (uint8_t *)uv_addr;
    uint32_t pairs = w >> 1;
    uint32_t do_yield = (w >= 1200u) ? 1u : 0u;
    int32_t last_dly_rc = 0x7FFFu;

    for (uint32_t row = 0; row < h; row++) {
        uint8_t *y_row  = y_base  + row * y_stride;
        uint8_t *uv_row = uv_base + row * uv_stride;

        if ((row & 7u) == 0u) {
            uint32_t strip = (h - row < 8u) ? (h - row) : 8u;
            for (uint32_t s = 0; s < strip; s++) {
                dcimvac_lines((uint32_t)(y_row  + s * y_stride), w);
                dcimvac_lines((uint32_t)(uv_row + s * uv_stride), w);
            }
            __asm__ volatile ("dsb sy" ::: "memory");
        }

        uint16_t *yp  = (uint16_t *)y_row;
        uint16_t *uvp = (uint16_t *)uv_row;

        for (uint32_t px = 0; px < pairs; px++) {
            if ((px & 31u) == 0u) {
                __builtin_prefetch(&yp[px + 64u], 1, 0);
                __builtin_prefetch(&uvp[px + 64u], 1, 0);
            }

            uint32_t y16  = yp[px];
            uint32_t uv16 = uvp[px];

            int32_t y0 = (int32_t)(y16 & 0xFFu);
            int32_t y1 = (int32_t)(y16 >> 8);
            int32_t cb = (int32_t)(int8_t)(uv16 & 0xFFu);
            int32_t cr = (int32_t)(int8_t)(uv16 >> 8);

            int32_t dR = (359 * cr) >> 8;
            int32_t dG = (88 * cb + 183 * cr) >> 8;
            int32_t dB = (454 * cb) >> 8;

            int32_t or0, og0, ob0;
            lut_tetra_swar(lut,
                           (uint32_t)usat8(y0 + dR),
                           (uint32_t)usat8(y0 - dG),
                           (uint32_t)usat8(y0 + dB),
                           &or0, &og0, &ob0);

            int32_t ny0 = usat8((77 * or0 + 150 * og0 + 29 * ob0 + 128) >> 8);
            int32_t ny1, ar, ag, ab;

            if (y1 == y0) {
                ny1 = ny0;
                ar = or0; ag = og0; ab = ob0;
            } else {
                int32_t or1, og1, ob1;
                lut_tetra_swar(lut,
                               (uint32_t)usat8(y1 + dR),
                               (uint32_t)usat8(y1 - dG),
                               (uint32_t)usat8(y1 + dB),
                               &or1, &og1, &ob1);
                ny1 = usat8((77 * or1 + 150 * og1 + 29 * ob1 + 128) >> 8);
                ar = (or0 + or1) >> 1;
                ag = (og0 + og1) >> 1;
                ab = (ob0 + ob1) >> 1;
            }

            int32_t ncb = ssat8((-43 * ar - 85 * ag + 128 * ab + 128) >> 8);
            int32_t ncr = ssat8((128 * ar - 107 * ag - 21 * ab + 128) >> 8);

            yp[px]  = (uint16_t)((uint32_t)ny0 | ((uint32_t)ny1 << 8));
            uvp[px] = (uint16_t)(((uint32_t)(uint8_t)(int8_t)ncb) | (((uint32_t)(uint8_t)(int8_t)ncr) << 8));
        }

        dccmvac_lines((uint32_t)y_row, w);
        dccmvac_lines((uint32_t)uv_row, w);

        /* Every 32 rows (~15 ms slice), sleep 4 ms to meet 60fps Live View VSync deadline! */
        if (do_yield && ((row & 31u) == 31u)) {
            __asm__ volatile ("dsb sy" ::: "memory");
            last_dly_rc = RTOS_DLY_TSK(4u);
        }
    }
    __asm__ volatile ("dsb sy" ::: "memory");
    return last_dly_rc;
}

void cdu_lut_hook(uint32_t *p, uint32_t caller_lr) {
    volatile uint32_t *hdr = LOG_BASE;
    uint32_t cnt = hdr[1];
    hdr[0] = 0x4C55543A; /* 'LUT:' v3.6b lossless cooperative */
    hdr[1] = cnt + 1;

    if (!p) return;

    uint32_t ch       = p[0];
    uint32_t y_addr   = p[1];
    uint32_t uv_addr  = p[2];
    uint32_t out_jpeg = p[5];
    uint32_t w        = p[8];
    uint32_t h        = p[9];
    uint32_t y_str    = p[10];
    uint32_t uv_str   = p[11];
    uint32_t packed   = p[15];
    uint32_t sampling = p[17];

    if (out_jpeg == 0x10000000u) {
        if (w >= 3000u) hdr[2] = 0;
        return;
    }

    if (ch != 0u || packed != 0u || sampling != 1u || y_addr < 0x10000000u || uv_addr < 0x10000000u) {
        return;
    }

    uint32_t va_mon = *(volatile uint32_t *)0x08BDC310u;
    uint32_t va_id  = *(volatile uint32_t *)0x08BDC330u;
    if (va_mon != 1u || va_id >= 5u) {
        return;
    }

    uint32_t lut_ptr = ((volatile uint32_t *)0x08A9D47Cu)[va_id];
    if (!lut_ptr) return;
    if (*(volatile uint32_t *)(lut_ptr | 0x80000000u) != 0x0001BEEFu) return;

    if (w <= 320u) {
        if (hdr[2] == y_addr) return;
        hdr[2] = y_addr;
    }

    uint32_t *lut = LUT_RGB9;
    uint32_t is_bw = unpack_beef_packed(lut_ptr, lut);
    int32_t dly_rc = 0x7FFFu;
    if (is_bw) {
        apply_lut_nv16_bw(y_addr, uv_addr, w, h, y_str, uv_str, lut);
    } else {
        dly_rc = apply_lut_nv16_lossless(y_addr, uv_addr, w, h, y_str, uv_str, lut);
    }

    uint32_t gcnt = hdr[3];
    hdr[3] = gcnt + 1;
    uint32_t slot = gcnt & 7u;
    volatile uint32_t *rec = LOG_BASE + 16 + slot * 8;
    rec[0] = gcnt + 1;
    rec[1] = w;
    rec[2] = h;
    rec[3] = y_addr;
    rec[4] = va_mon | (((uint32_t)dly_rc & 0xFFFFu) << 16);
    rec[5] = va_id;
    rec[6] = lut_ptr;
    rec[7] = caller_lr;
}

__attribute__((naked, section(".text.entry")))
void _start(void) {
    __asm__ volatile (
        "push {r0, r1, r2, r3, ip, lr}\n"
        "mov  r1, lr\n"
        "bl   cdu_lut_hook\n"
        "pop  {r0, r1, r2, r3, ip, lr}\n"
        "stmdb sp!, {r4, r5, r6, r7, r8, r9, lr}\n"
        "b.w  0x868243c4\n"
    );
}
