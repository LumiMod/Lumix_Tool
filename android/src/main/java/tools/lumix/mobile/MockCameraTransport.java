package tools.lumix.mobile;

import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;

/**
 * In-memory simulated DC-S5 (MC801 FW 2.9, body version 0x0290) implementing LumixProtocol.Transport.
 * Keeps simulated writes strictly in volatile Java memory and never touches real hardware or real backups.
 */
public final class MockCameraTransport implements LumixProtocol.Transport {
    // Stock v2.9 sound table {virtAddr, byteLen, configPtr} from docs/SOUND_TABLE.md §2
    private static final long[][] STOCK_SLOTS = {
            {0x06A97580L, 24064L, 0x06BE7D80L},
            {0x06AA3180L, 14464L, 0x06BFF580L},
            {0x06AAA280L, 14464L, 0x06C0D780L},
            {0x06AB1380L, 14464L, 0x06C1B900L},
            {0x06B22980L, 41216L, 0x06CFEB00L},
            {0x06B51F00L, 95104L, 0x06D5D600L},
            {0x06B2CA80L, 152704L, 0x06D12D00L},
            {0x06B69280L, 200704L, 0x06D8BD00L},
            {0x06A82500L, 18304L, 0x06BBDC80L},
            {0x06A86C80L, 47104L, 0x06BC6B80L},
            {0x06A92480L, 20736L, 0x06BDDB80L},
            {0x06AD4780L, 8064L, 0x06C62100L},
            {0x06AF9C80L, 8064L, 0x06CACD00L},
            {0x06B1EA80L, 8064L, 0x06CF6B00L},
            {0x06ACB180L, 19200L, 0x06C4F500L},
            {0x06AF0680L, 19200L, 0x06C9A100L},
            {0x06B17980L, 14464L, 0x06CE8900L},
            {0x06AC1B80L, 19200L, 0x06C3C900L},
            {0x06AE4A80L, 24064L, 0x06C82900L},
            {0x06B0BD80L, 24064L, 0x06CD1100L},
            {0x06AB8480L, 19328L, 0x06C29B00L},
            {0x06AD8680L, 25088L, 0x06C6A100L},
            {0x06AFDB80L, 28928L, 0x06CB4D00L},
            {0x06B9A280L, 3072L, 0x06DEDD00L},
            {0x06A82500L, 18304L, 0x06BBDC80L},
            {0x06B9AE80L, 18048L, 0x06DEF500L},
            {0x06B9F500L, 102400L, 0x06DF8200L},
            {0x06BB8500L, 22400L, 0x06E2A200L},
    };

    private final byte[] scratch = new byte[(int) (LumixProtocol.SCRATCH_END - LumixProtocol.SCRATCH_START)];
    private final byte[] tableWindow = new byte[2048]; // covers 0x86E35000..0x86E35800
    private final Map<Long, Integer> halfwords = new HashMap<>();
    private final boolean interactivePacing;

    public MockCameraTransport(boolean interactivePacing) {
        this.interactivePacing = interactivePacing;
        reset();
    }

    public synchronized void reset() {
        int span = scratch.length;
        Arrays.fill(scratch, (byte) 0x55);
        int e1 = ((int) (span * 0.20) / 1024) * 1024;
        int e2 = ((int) (span * 0.30) / 1024) * 1024;
        int e3 = ((int) (span * 0.45) / 1024) * 1024;
        int e4 = ((int) (span * 0.80) / 1024) * 1024;
        Arrays.fill(scratch, e1, e2, (byte) 0xA7);
        Arrays.fill(scratch, e2, e3, (byte) 0x00);
        Arrays.fill(scratch, e4, span, (byte) 0xA7);

        Arrays.fill(tableWindow, (byte) 0x00);
        int tableOffset = (int) (LumixProtocol.SOUND_TABLE_ADDR - 0x86E35000L);
        for (int i = 0; i < LumixProtocol.SLOT_COUNT; i++) {
            int base = tableOffset + i * 32;
            long virt = STOCK_SLOTS[i][0];
            long bytes = STOCK_SLOTS[i][1];
            long cfg = STOCK_SLOTS[i][2];
            LumixProtocol.putU32LE(tableWindow, base, i);
            LumixProtocol.putU32LE(tableWindow, base + 4, virt);
            LumixProtocol.putU32LE(tableWindow, base + 8, virt + bytes);
            LumixProtocol.putU32LE(tableWindow, base + 12, cfg);
            LumixProtocol.putU32LE(tableWindow, base + 16, cfg + 0x100L);
            LumixProtocol.putU32LE(tableWindow, base + 20, bytes);
            LumixProtocol.putU32LE(tableWindow, base + 24, cfg);
            LumixProtocol.putU32LE(tableWindow, base + 28, 1L);
        }

        halfwords.clear();
        halfwords.put(LumixProtocol.VERSION_ADDR, LumixProtocol.VERIFIED_BODY_VERSION);
        for (long[] sig : LumixProtocol.SIG_CHECKS) {
            halfwords.put(sig[0], (int) sig[1]);
        }
        for (long[] patch : LumixProtocol.UNLOCK_PATCHES) {
            halfwords.put(patch[0], (int) patch[2]); // stock by default
        }
    }

    public synchronized void setBodyVersion(int version) {
        halfwords.put(LumixProtocol.VERSION_ADDR, version & 0xFFFF);
    }

    @Override
    public synchronized int readHalf(long addr) {
        long a = addr & 0xFFFFFFFFL;
        if (a >= LumixProtocol.SCRATCH_START && a + 2 <= LumixProtocol.SCRATCH_END) {
            int off = (int) (a - LumixProtocol.SCRATCH_START);
            return (scratch[off] & 0xFF) | ((scratch[off + 1] & 0xFF) << 8);
        }
        if (a >= 0x86E35000L && a + 2 <= 0x86E35800L) {
            int off = (int) (a - 0x86E35000L);
            return (tableWindow[off] & 0xFF) | ((tableWindow[off + 1] & 0xFF) << 8);
        }
        Integer v = halfwords.get(a);
        return v != null ? (v & 0xFFFF) : 0;
    }

    @Override
    public synchronized void writeHalf(long addr, int value) throws Exception {
        long a = addr & 0xFFFFFFFFL;
        int v = value & 0xFFFF;
        if (a >= LumixProtocol.SCRATCH_START && a + 2 <= LumixProtocol.SCRATCH_END) {
            int off = (int) (a - LumixProtocol.SCRATCH_START);
            scratch[off] = (byte) (v & 0xFF);
            scratch[off + 1] = (byte) ((v >>> 8) & 0xFF);
            if (interactivePacing && (off % 4096 == 0)) {
                Thread.sleep(1L);
            }
            return;
        }
        if (a >= 0x86E35000L && a + 2 <= 0x86E35800L) {
            int off = (int) (a - 0x86E35000L);
            tableWindow[off] = (byte) (v & 0xFF);
            tableWindow[off + 1] = (byte) ((v >>> 8) & 0xFF);
            return;
        }
        halfwords.put(a, v);
    }

    @Override
    public synchronized byte[] readBlock(long alignedAddr) throws Exception {
        long a = alignedAddr & 0xFFFFFFFFL;
        if ((a & 0x3FFL) != 0) {
            throw new IllegalArgumentException("Unaligned block address: " + LumixProtocol.hexAddr(a));
        }
        if (a >= LumixProtocol.SCRATCH_START && a + 1024 <= LumixProtocol.SCRATCH_END) {
            int off = (int) (a - LumixProtocol.SCRATCH_START);
            if (interactivePacing && (off % (256 * 1024) == 0)) {
                Thread.sleep(18L);
            }
            return Arrays.copyOfRange(scratch, off, off + 1024);
        }
        if (a >= 0x86E35000L && a + 1024 <= 0x86E35800L) {
            int off = (int) (a - 0x86E35000L);
            return Arrays.copyOfRange(tableWindow, off, off + 1024);
        }
        byte[] block = new byte[1024];
        for (int off = 0; off < 1024; off += 2) {
            Integer v = halfwords.get(a + off);
            if (v != null) {
                block[off] = (byte) (v & 0xFF);
                block[off + 1] = (byte) ((v >>> 8) & 0xFF);
            }
        }
        return block;
    }
}
