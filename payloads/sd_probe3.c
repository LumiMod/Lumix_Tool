/* SD read probe v3: pass the PHYSICAL buffer address (DMA likely uses it).
 *
 * Results at 0x8F300020:
 *   [0] 0x0000C1C1 entered
 *   [1] return value
 *   [2] first word of the buffer (sector 0 data)
 *   [3] 0x0000C2C2 returned
 */
#define REG32(a) (*(volatile unsigned int *)(a))
typedef unsigned int u32;

typedef int (*sd_read_t)(u32 ctx, u32 ptr, u32 count, u32 offset);

#define SD_CTX_V    0x08AB07A4u
#define SCRATCH_P   0x8F303000u
#define SCRATCH_V   0x0F303000u
#define BUF_P       0x8F304000u
#define MARK        0x8F300020u

void _start(void) {
    volatile u32 *m = (volatile u32 *)MARK;
    m[0] = 0x0000C1C1u;
    m[1] = 0;
    m[2] = 0;
    m[3] = 0;

    REG32(SCRATCH_P) = BUF_P;          /* physical address for DMA */
    sd_read_t rd = (sd_read_t)0x863C0505u;
    int ret = rd(SD_CTX_V, SCRATCH_V, 0x200u, 0u);

    m[1] = (u32)ret;
    m[2] = REG32(BUF_P);
    m[3] = 0x0000C2C2u;
}
