/* SD read probe v2: r1 points to a word holding the BUFFER ADDRESS.
 *
 * SDD_Read does `ldr r1, [sl]` and rejects the call when that word is zero,
 * which is why passing a pointer to the offset (0) failed.
 *
 * Results at 0x8F300020:
 *   [0] 0x0000B1B1 entered
 *   [1] return value
 *   [2] first word of the buffer (sector 0 data)
 *   [3] 0x0000B2B2 returned
 */
#define REG32(a) (*(volatile unsigned int *)(a))
typedef unsigned int u32;

typedef int (*sd_read_t)(u32 ctx, u32 ptr, u32 count, u32 offset);

#define SD_CTX_V    0x08AB07A4u
#define SCRATCH_P   0x8F303000u
#define SCRATCH_V   0x0F303000u
#define BUF_P       0x8F304000u
#define BUF_V       0x0F304000u
#define MARK        0x8F300020u

void _start(void) {
    volatile u32 *m = (volatile u32 *)MARK;
    m[0] = 0x0000B1B1u;
    m[1] = 0;
    m[2] = 0;
    m[3] = 0;

    REG32(SCRATCH_P) = BUF_V;          /* word that holds the buffer address */
    sd_read_t rd = (sd_read_t)0x863C0505u;
    int ret = rd(SD_CTX_V, SCRATCH_V, 0x200u, 0u);

    m[1] = (u32)ret;
    m[2] = REG32(BUF_P);
    m[3] = 0x0000B2B2u;
}
