package tools.lumix.mobile;

import org.json.JSONArray;
import org.json.JSONObject;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;

/**
 * Pure protocol, safety-guard, sound-table, scratch-scanner, and S5-unlocker logic
 * for Panasonic Lumix DC-S5 Service Mode (04DA:2370).
 */
public final class LumixProtocol {
    public static final int VID = 0x04DA;
    public static final int SERVICE_PID = 0x2370;

    public static final int REQUEST_KIND = 0x08;
    public static final int BLOCK_KIND = 0x01;
    public static final int BLOCK_DATA_LEN = 1024;
    public static final int BLOCK_FRAME_LEN = 1030;

    public static final long VERSION_ADDR = 0x863B0000L;
    public static final int VERIFIED_BODY_VERSION = 0x0290;

    public static final long SOUND_TABLE_ADDR = 0x86E35100L;
    public static final int SLOT_COUNT = 28;
    public static final int ENTRY_SIZE = 32;

    public static final long SCRATCH_START = 0x8F000000L;
    public static final long SCRATCH_END = 0x8F800000L;
    public static final long PROGRAM_VIRT_START = 0x06280000L;
    public static final long PROGRAM_VIRT_END = 0x07280000L;
    public static final long LEGACY_SCRATCH_VIRT_START = 0x0B5B0000L;
    public static final long LEGACY_SCRATCH_VIRT_END = 0x0BAD0000L;

    public static final byte[] HEADER_MAGIC = "LMXTSLOT".getBytes(StandardCharsets.US_ASCII);
    public static final int HEADER_SIZE = 16;
    public static final int TAIL_GUARD_BYTES = 2048;
    public static final int MAX_SAMPLES = 3 * 44100;
    public static final long MAX_TABLE_BYTES = 0x100000L;

    // rileydeacon/s5-unlocker: MC801 FW 2.9 13 firmware signature anchors {addr, allowed1, allowed2}
    public static final long[][] SIG_CHECKS = {
            {0x866B493AL, 0x2801L, -1L},
            {0x866B493EL, 0xB2E0L, -1L},
            {0x866B4952L, 0x486BL, -1L},
            {0x866B4956L, 0xBD10L, -1L},
            {0x86F15E8CL, 0x00CEL, -1L},
            {0x86F15E98L, 0xFFFFL, -1L},
            {0x87089604L, 0x00CEL, -1L},
            {0x87089634L, 0xFFFFL, -1L},
            {0x08A68C4CL, 0x00CEL, -1L},
            {0x08A6844CL, 0x00CEL, -1L},
            {0x868261B4L, 0x460DL, -1L},
            {0x868261B6L, 0x4628L, 0x2000L},
            {0x868261B8L, 0xE8BDL, -1L},
    };

    // rileydeacon/s5-unlocker: 19 volatile RAM halfword patches {addr, unlockVal, stockVal}
    public static final long[][] UNLOCK_PATCHES = {
            // 1) NTSC Validator Whitelist (0x86F15E30 tail)
            {0x86F15E90L, 0x00F1L, 0x00D1L},
            {0x86F15E92L, 0x80F1L, 0x80D1L},
            {0x86F15E94L, 0x00EDL, 0x00D2L},
            {0x86F15E96L, 0x80EDL, 0x80D2L},

            // 2) Master ROM-in-RAM MOV Template (0x87089524 tail — survives soft power-off/on)
            {0x87089614L, 0x00F1L, 0x00D1L},
            {0x8708961CL, 0x80F1L, 0x80D1L},
            {0x87089624L, 0x00EDL, 0x00D2L},
            {0x8708962CL, 0x80EDL, 0x80D2L},

            // 3) Active NTSC MOV Source Template (0x08A68B6C tail)
            {0x08A68C5CL, 0x00F1L, 0x00D1L},
            {0x08A68C64L, 0x80F1L, 0x80D1L},
            {0x08A68C6CL, 0x00EDL, 0x00D2L},
            {0x08A68C74L, 0x80EDL, 0x80D2L},

            // 4) Live UI Menu Table (0x08A6836C tail, visibility=0x0104)
            {0x08A6845CL, 0x00F1L, 0x00D1L},
            {0x08A6845EL, 0x0104L, 0x0104L},
            {0x08A68464L, 0x80F1L, 0x80D1L},
            {0x08A6846CL, 0x00EDL, 0x00D2L},
            {0x08A6846EL, 0x0104L, 0x0104L},
            {0x08A68474L, 0x80EDL, 0x80D2L},

            // 5) Unlimited recording in ALL limited modes (0x86826102 returns 0)
            {0x868261B6L, 0x2000L, 0x4628L},
    };

    // Real-Time JPEG Direct-Output 3D LUT (RAM-only, MC801 FW 2.9 verified)
    public static final long LUT_PAYLOAD_ADDR = 0x86370000L;
    public static final long LUT_HOOK_ADDR = 0x868243C0L;
    public static final byte[] LUT_HOOK_ORIG = new byte[]{(byte) 0x2D, (byte) 0xE9, (byte) 0xF0, (byte) 0x43};
    public static final byte[] LUT_HOOK_PATCH = new byte[]{(byte) 0x4B, (byte) 0xF7, (byte) 0x1E, (byte) 0xB6};
    public static final byte[] LUT_HOOK_NEXT_ANCHOR = new byte[]{(byte) 0x04, (byte) 0x46, (byte) 0x00, (byte) 0x68};
    public static final long LUT_PLAYBACK_PREV_ADDR = 0x866AE76EL;
    public static final byte[] LUT_PLAYBACK_PREV_ANCHOR = new byte[]{(byte) 0x08, (byte) 0x42};
    public static final long LUT_PLAYBACK_ADDR = 0x866AE770L;
    public static final byte[] LUT_PLAYBACK_ORIG = new byte[]{(byte) 0x13, (byte) 0xD0};
    public static final byte[] LUT_PLAYBACK_PATCH = new byte[]{(byte) 0x13, (byte) 0xE0};
    public static final long LUT_LOG_ADDR = 0x8F300000L;
    public static final long LUT_VA_MON_ADDR = 0x88BDC310L;
    public static final long LUT_VA_ID_ADDR = 0x88BDC330L;
    public static final long LUT_SLOTS_PTR_ADDR = 0x88A9D47CL;

    public interface Transport {
        int readHalf(long addr) throws Exception;
        void writeHalf(long addr, int value) throws Exception;
        byte[] readBlock(long alignedAddr) throws Exception;
    }

    public interface ProgressListener {
        void onProgress(int done, int total);
    }

    public static final class RegionNotFreeException extends Exception {
        public final String address;
        public RegionNotFreeException(long addr) {
            super("region not free");
            this.address = hexAddr(addr);
        }
    }

    public static final class UnsupportedFirmwareException extends Exception {
        public UnsupportedFirmwareException(String message) {
            super(message);
        }
    }

    private LumixProtocol() {}

    public static String hexAddr(long addr) {
        return String.format(Locale.US, "0x%08X", addr & 0xFFFFFFFFL);
    }

    public static String hexWord(int word) {
        return String.format(Locale.US, "0x%04X", word & 0xFFFF);
    }

    public static String toHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) {
            sb.append(Character.forDigit((b >>> 4) & 0xF, 16));
            sb.append(Character.forDigit(b & 0xF, 16));
        }
        return sb.toString();
    }

    public static byte[] fromHex(String hex) {
        if (hex == null || (hex.length() & 1) != 0) {
            throw new IllegalArgumentException("Invalid hex string");
        }
        byte[] out = new byte[hex.length() / 2];
        for (int i = 0; i < out.length; i++) {
            int hi = Character.digit(hex.charAt(i * 2), 16);
            int lo = Character.digit(hex.charAt(i * 2 + 1), 16);
            if (hi < 0 || lo < 0) throw new IllegalArgumentException("Invalid hex character");
            out[i] = (byte) ((hi << 4) | lo);
        }
        return out;
    }

    public static long u32LE(byte[] buf, int offset) {
        return (buf[offset] & 0xFFL)
                | ((buf[offset + 1] & 0xFFL) << 8)
                | ((buf[offset + 2] & 0xFFL) << 16)
                | ((buf[offset + 3] & 0xFFL) << 24);
    }

    public static void putU32LE(byte[] buf, int offset, long val) {
        buf[offset] = (byte) (val & 0xFFL);
        buf[offset + 1] = (byte) ((val >>> 8) & 0xFFL);
        buf[offset + 2] = (byte) ((val >>> 16) & 0xFFL);
        buf[offset + 3] = (byte) ((val >>> 24) & 0xFFL);
    }

    public static int frameSum(byte[] buf, int len) {
        int s = 0;
        for (int i = 1; i + 2 < len; i++) {
            s = (s + (buf[i] & 0xFF)) & 0xFF;
        }
        return s;
    }

    public static byte[] buildReadHalfFrame(long addr) {
        byte[] tx = new byte[16];
        tx[0] = REQUEST_KIND;
        tx[1] = 0x00;
        tx[2] = (byte) 0xFF;
        tx[3] = (byte) 0x9B;
        putU32LE(tx, 4, addr);
        tx[14] = (byte) frameSum(tx, 16);
        tx[15] = 0x00;
        return tx;
    }

    public static int parseReadHalfReply(byte[] rx, int len) throws Exception {
        if (len != 16 || (rx[0] & 0xFF) != REQUEST_KIND || rx[1] != 0 || (rx[2] & 0xFF) != 0xFF
                || (rx[3] & 0xFF) != 0x36 || (rx[14] & 0xFF) != frameSum(rx, 16) || rx[15] != 0) {
            throw new Exception("0x9B 读取校验失败");
        }
        return (rx[4] & 0xFF) | ((rx[5] & 0xFF) << 8);
    }

    public static byte[] buildWriteHalfFrame(long addr, int val) {
        byte[] tx = new byte[16];
        tx[0] = REQUEST_KIND;
        tx[1] = 0x00;
        tx[2] = (byte) 0xFF;
        tx[3] = (byte) 0x9C;
        putU32LE(tx, 4, addr);
        tx[8] = (byte) (val & 0xFF);
        tx[9] = (byte) ((val >>> 8) & 0xFF);
        tx[14] = (byte) frameSum(tx, 16);
        tx[15] = 0x00;
        return tx;
    }

    public static void validateWriteHalfReply(byte[] rx, int len) throws Exception {
        if (len < 6) throw new Exception("0x9C 写入应答过短: " + len);
        int op = rx[3] & 0xFF;
        if ((rx[0] & 0xFF) != REQUEST_KIND || rx[1] != 0 || (rx[2] & 0xFF) != 0xFF
                || (rx[len - 2] & 0xFF) != frameSum(rx, len) || rx[len - 1] != 0
                || (op != 0x00 && op != 0x01)) {
            throw new Exception("0x9C 写入被拒绝或校验和错误");
        }
    }

    public static byte[] buildReadBlockFrame(long alignedAddr) {
        if ((alignedAddr & 0x3FFL) != 0 || alignedAddr < 0 || alignedAddr + BLOCK_DATA_LEN > 0x100000000L) {
            throw new IllegalArgumentException("0x5C 块读取地址必须按 1024 对齐: " + hexAddr(alignedAddr));
        }
        byte[] tx = new byte[BLOCK_FRAME_LEN];
        tx[0] = BLOCK_KIND;
        tx[1] = 0x00;
        tx[2] = (byte) 0xFF;
        tx[3] = 0x5C;
        putU32LE(tx, 4, alignedAddr);
        putU32LE(tx, 8, alignedAddr + BLOCK_DATA_LEN);
        tx[1028] = (byte) frameSum(tx, BLOCK_FRAME_LEN);
        tx[1029] = 0x00;
        return tx;
    }

    public static byte[] parseReadBlockReply(byte[] rx, int len) throws Exception {
        if (len != BLOCK_FRAME_LEN || (rx[0] & 0xFF) != BLOCK_KIND || rx[1] != 0
                || (rx[2] & 0xFF) != 0xFF || (rx[3] & 0xFF) != 0x05
                || (rx[1028] & 0xFF) != frameSum(rx, BLOCK_FRAME_LEN) || rx[1029] != 0) {
            throw new Exception("0x5C 块读取校验失败");
        }
        return Arrays.copyOfRange(rx, 4, 4 + BLOCK_DATA_LEN);
    }

    public static byte[] readBytes(Transport t, long addr, int length) throws Exception {
        if (length <= 0) return new byte[0];
        long aligned = addr & ~0x3FFL;
        int skip = (int) (addr - aligned);
        int totalNeeded = skip + length;
        int blocks = (totalNeeded + BLOCK_DATA_LEN - 1) / BLOCK_DATA_LEN;
        byte[] all = new byte[blocks * BLOCK_DATA_LEN];
        for (int b = 0; b < blocks; b++) {
            byte[] chunk = t.readBlock(aligned + (long) b * BLOCK_DATA_LEN);
            if (chunk == null || chunk.length != BLOCK_DATA_LEN) {
                throw new Exception("读取内存块失败: " + hexAddr(aligned + (long) b * BLOCK_DATA_LEN));
            }
            System.arraycopy(chunk, 0, all, b * BLOCK_DATA_LEN, BLOCK_DATA_LEN);
        }
        return Arrays.copyOfRange(all, skip, skip + length);
    }

    public static void writeHalfwords(Transport t, long addr, byte[] data) throws Exception {
        if ((data.length & 1) != 0) {
            throw new IllegalArgumentException("半字写入长度必须为偶数");
        }
        for (int offset = 0; offset < data.length; offset += 2) {
            int half = (data[offset] & 0xFF) | ((data[offset + 1] & 0xFF) << 8);
            t.writeHalf(addr + offset, half);
        }
    }

    public static boolean isStockAddress(long virtAddr) {
        return virtAddr >= PROGRAM_VIRT_START && virtAddr < PROGRAM_VIRT_END;
    }

    public static boolean isScratchVirtual(long virtAddr) {
        long curStart = SCRATCH_START - 0x80000000L;
        long curEnd = SCRATCH_END - 0x80000000L;
        return (virtAddr >= curStart && virtAddr < curEnd)
                || (virtAddr >= LEGACY_SCRATCH_VIRT_START && virtAddr < LEGACY_SCRATCH_VIRT_END);
    }

    public static int validateIndex(int idx) {
        if (idx < 0 || idx >= SLOT_COUNT) {
            throw new IllegalArgumentException("音效编号必须在 0..27 之间");
        }
        return idx;
    }

    public static long validateRegion(long addr, int samples) {
        if (samples <= 0 || samples > MAX_SAMPLES) {
            throw new IllegalArgumentException("采样数量超出范围 (1.." + MAX_SAMPLES + ")");
        }
        if ((addr % BLOCK_DATA_LEN) != 0 || addr < SCRATCH_START
                || addr + HEADER_SIZE + (long) samples * 2L + TAIL_GUARD_BYTES > SCRATCH_END) {
            throw new IllegalArgumentException(String.format(Locale.US,
                    "写入地址必须按 1 KiB 对齐并位于 %s..%s 内", hexAddr(SCRATCH_START), hexAddr(SCRATCH_END)));
        }
        return addr;
    }

    public static byte[] encodeHeader(int idx, int samples) {
        validateIndex(idx);
        if (samples <= 0 || samples > MAX_SAMPLES) {
            throw new IllegalArgumentException("采样数量超出范围");
        }
        ByteBuffer buf = ByteBuffer.allocate(HEADER_SIZE).order(ByteOrder.LITTLE_ENDIAN);
        buf.put(HEADER_MAGIC);
        buf.putInt(idx);
        buf.putInt(samples);
        return buf.array();
    }

    public static int[] decodeHeader(byte[] raw) {
        if (raw == null || raw.length < HEADER_SIZE) return null;
        for (int i = 0; i < HEADER_MAGIC.length; i++) {
            if (raw[i] != HEADER_MAGIC[i]) return null;
        }
        long idx = u32LE(raw, 8);
        long samples = u32LE(raw, 12);
        if (idx < SLOT_COUNT && samples > 0 && samples <= MAX_SAMPLES) {
            return new int[]{(int) idx, (int) samples};
        }
        return null;
    }

    public static boolean regionIsFree(byte[] raw, int idx) {
        validateIndex(idx);
        if (raw == null) return true;
        for (int offset = 0; offset + HEADER_SIZE <= raw.length; offset += BLOCK_DATA_LEN) {
            byte[] slice = Arrays.copyOfRange(raw, offset, offset + HEADER_SIZE);
            int[] header = decodeHeader(slice);
            if (header != null && header[0] != idx) return false;
        }
        return true;
    }

    public static String entryProblem(byte[] entry32, int expectedIdx) {
        if (entry32 == null || entry32.length != ENTRY_SIZE) {
            return "entry " + expectedIdx + " byte length invalid";
        }
        long id = u32LE(entry32, 0);
        long addr = u32LE(entry32, 4);
        long bytes = u32LE(entry32, 0x14);
        if (id != expectedIdx) {
            return "entry " + expectedIdx + " has id " + id;
        }
        if (bytes <= 0 || bytes > MAX_TABLE_BYTES) {
            return "entry " + expectedIdx + " has implausible PCM length " + bytes + " bytes";
        }
        if (!isStockAddress(addr) && !isScratchVirtual(addr)) {
            return "entry " + expectedIdx + " points at unexpected address " + hexAddr(addr);
        }
        return null;
    }

    public static String tableProblem(byte[] rawTable) {
        if (rawTable == null || rawTable.length < SLOT_COUNT * ENTRY_SIZE) {
            return "sound table truncated";
        }
        for (int i = 0; i < SLOT_COUNT; i++) {
            byte[] slice = Arrays.copyOfRange(rawTable, i * ENTRY_SIZE, (i + 1) * ENTRY_SIZE);
            String problem = entryProblem(slice, i);
            if (problem != null) return problem;
        }
        return null;
    }

    public static int readBodyVersion(Transport t) throws Exception {
        return t.readHalf(VERSION_ADDR) & 0xFFFF;
    }

    public static int requireWritable(Transport t) throws Exception {
        int ver = readBodyVersion(t);
        if (ver != VERIFIED_BODY_VERSION) {
            throw new UnsupportedFirmwareException(String.format(Locale.US,
                    "unsupported firmware: body version 0x%04X has not been verified (verified: 0x0290); writing is disabled",
                    ver));
        }
        byte[] table = readBytes(t, SOUND_TABLE_ADDR, SLOT_COUNT * ENTRY_SIZE);
        String problem = tableProblem(table);
        if (problem != null) {
            throw new UnsupportedFirmwareException("sound table check failed: " + problem + "; writing is disabled");
        }
        return ver;
    }

    public static JSONArray parseSoundEntries(byte[] rawTable) throws Exception {
        JSONArray entries = new JSONArray();
        for (int i = 0; i < SLOT_COUNT; i++) {
            byte[] e = Arrays.copyOfRange(rawTable, i * ENTRY_SIZE, (i + 1) * ENTRY_SIZE);
            long id = u32LE(e, 0);
            long addr = u32LE(e, 4);
            long addr2 = u32LE(e, 8);
            long bytes = u32LE(e, 0x14);
            JSONObject obj = new JSONObject();
            obj.put("index", i);
            obj.put("id", id);
            obj.put("addr", hexAddr(addr));
            obj.put("addr2", hexAddr(addr2));
            obj.put("size", bytes);
            obj.put("bytes", bytes);
            obj.put("samples", bytes / 2L);
            obj.put("hex", toHex(e));
            entries.put(obj);
        }
        return entries;
    }

    public static JSONObject inspectServiceDevice(Transport t) throws Exception {
        int ver = readBodyVersion(t);
        byte[] rawTable = readBytes(t, SOUND_TABLE_ADDR, SLOT_COUNT * ENTRY_SIZE);
        String problem = tableProblem(rawTable);
        JSONArray entries = parseSoundEntries(rawTable);
        boolean custom = false;
        for (int i = 0; i < SLOT_COUNT; i++) {
            byte[] e = Arrays.copyOfRange(rawTable, i * ENTRY_SIZE, (i + 1) * ENTRY_SIZE);
            if (isScratchVirtual(u32LE(e, 4))) {
                custom = true;
                break;
            }
        }
        byte[] id1 = Arrays.copyOfRange(rawTable, ENTRY_SIZE, 2 * ENTRY_SIZE);
        long id1Addr = u32LE(id1, 4);
        long id1Bytes = u32LE(id1, 0x14);

        JSONObject out = new JSONObject();
        out.put("connected", true);
        out.put("mode", "service");
        out.put("model", "DC-S5");
        out.put("body_version", hexWord(ver));
        out.put("verified", ver == VERIFIED_BODY_VERSION && problem == null);
        out.put("table_problem", problem == null ? JSONObject.NULL : problem);
        out.put("id1_addr", hexAddr(id1Addr));
        out.put("id1_bytes", id1Bytes);
        out.put("id1_samples", id1Bytes / 2L);
        out.put("custom", custom);
        out.put("entries", entries);
        out.put("unlock", inspectUnlock(t));
        out.put("lut", inspectLut(t, null, null));
        return out;
    }

    public static JSONObject inspectLut(Transport t, byte[] fastBin, byte[] losslessBin) throws Exception {
        JSONObject info = new JSONObject();
        info.put("supported", false);
        info.put("enabled", false);
        info.put("mode", "stock");
        info.put("playbackFix", false);
        try {
            int ver = readBodyVersion(t);
            if (ver != VERIFIED_BODY_VERSION) {
                throw new UnsupportedFirmwareException("仅支持初代 DC-S5 (MC801) 固件 2.9");
            }
            byte[] hookBytes = readBytes(t, LUT_HOOK_ADDR, 8);
            byte[] playBytes = readBytes(t, LUT_PLAYBACK_PREV_ADDR, 4);
            byte[] hookInsn = Arrays.copyOfRange(hookBytes, 0, 4);
            byte[] nextInsn = Arrays.copyOfRange(hookBytes, 4, 8);
            byte[] prevPlay = Arrays.copyOfRange(playBytes, 0, 2);
            byte[] playInsn = Arrays.copyOfRange(playBytes, 2, 4);

            if (!Arrays.equals(nextInsn, LUT_HOOK_NEXT_ANCHOR) || !Arrays.equals(prevPlay, LUT_PLAYBACK_PREV_ANCHOR)) {
                throw new UnsupportedFirmwareException("固件 LUT 特征锚点不匹配，已拒绝写入");
            }
            if (!Arrays.equals(hookInsn, LUT_HOOK_ORIG) && !Arrays.equals(hookInsn, LUT_HOOK_PATCH)) {
                throw new UnsupportedFirmwareException("0x868243C0 指令未知: " + toHex(hookInsn));
            }
            if (!Arrays.equals(playInsn, LUT_PLAYBACK_ORIG) && !Arrays.equals(playInsn, LUT_PLAYBACK_PATCH)) {
                throw new UnsupportedFirmwareException("0x866AE770 指令未知: " + toHex(playInsn));
            }
            boolean enabled = Arrays.equals(hookInsn, LUT_HOOK_PATCH);
            boolean playbackFix = Arrays.equals(playInsn, LUT_PLAYBACK_PATCH);
            String mode = "stock";
            if (enabled) {
                mode = "fast";
                if (fastBin != null && losslessBin != null) {
                    int checkLen = Math.min(64, Math.min(fastBin.length, losslessBin.length));
                    byte[] curHead = readBytes(t, LUT_PAYLOAD_ADDR, checkLen);
                    if (Arrays.equals(curHead, Arrays.copyOf(fastBin, checkLen))) {
                        mode = "fast";
                    } else if (Arrays.equals(curHead, Arrays.copyOf(losslessBin, checkLen))) {
                        mode = "lossless";
                    } else {
                        mode = "custom";
                    }
                }
            }
            long vaMon = u32LE(readBytes(t, LUT_VA_MON_ADDR, 4), 0);
            long vaId = u32LE(readBytes(t, LUT_VA_ID_ADDR, 4), 0);
            info.put("supported", true);
            info.put("firmware", "MC801 2.9");
            info.put("enabled", enabled);
            info.put("mode", mode);
            info.put("playbackFix", playbackFix);
            info.put("viewAssistMonitor", (int) vaMon);
            info.put("activeLutId", vaId < 5L ? (int) vaId : 0);
        } catch (Exception err) {
            info.put("error", err.getMessage());
        }
        return info;
    }

    public static JSONObject applyLut(Transport t, boolean enable, String mode, boolean playbackFix,
                                      byte[] payloadBytes, ProgressListener listener) throws Exception {
        if (!"fast".equals(mode) && !"lossless".equals(mode)) {
            throw new IllegalArgumentException("mode must be fast or lossless");
        }
        JSONObject status = inspectLut(t, null, null);
        if (!status.optBoolean("supported", false)) {
            throw new UnsupportedFirmwareException(status.optString("error", "当前固件不支持 LUT 直出"));
        }

        if (!enable) {
            writeHalfwords(t, LUT_HOOK_ADDR, LUT_HOOK_ORIG);
            writeHalfwords(t, LUT_PLAYBACK_ADDR, LUT_PLAYBACK_ORIG);
            if (!Arrays.equals(readBytes(t, LUT_HOOK_ADDR, 4), LUT_HOOK_ORIG)) {
                throw new Exception("恢复 0x868243C0 校验失败");
            }
            if (!Arrays.equals(readBytes(t, LUT_PLAYBACK_ADDR, 2), LUT_PLAYBACK_ORIG)) {
                throw new Exception("恢复 0x866AE770 校验失败");
            }
            if (listener != null) listener.onProgress(1, 1);
            JSONObject out = new JSONObject();
            out.put("ok", true);
            out.put("enabled", false);
            out.put("mode", "stock");
            out.put("playbackFix", false);
            return out;
        }

        if (payloadBytes == null || payloadBytes.length < 64 || (payloadBytes.length & 1) != 0) {
            throw new IllegalArgumentException("LUT 引擎载荷无效");
        }

        if (status.optBoolean("enabled", false)) {
            writeHalfwords(t, LUT_HOOK_ADDR, LUT_HOOK_ORIG);
        }

        int totalHw = payloadBytes.length / 2 + 4;
        int done = 0;
        writeHalfwords(t, LUT_LOG_ADDR, new byte[32]);
        done++;
        if (listener != null) listener.onProgress(done, totalHw);

        for (int off = 0; off < payloadBytes.length; off += 2) {
            int val = (payloadBytes[off] & 0xFF) | ((payloadBytes[off + 1] & 0xFF) << 8);
            t.writeHalf(LUT_PAYLOAD_ADDR + off, val);
            done++;
            if (listener != null && (done % 64 == 0 || off + 2 >= payloadBytes.length)) {
                listener.onProgress(done, totalHw);
            }
        }

        if (!Arrays.equals(readBytes(t, LUT_PAYLOAD_ADDR, payloadBytes.length), payloadBytes)) {
            throw new Exception("LUT 引擎写入回读校验不一致");
        }

        writeHalfwords(t, LUT_HOOK_ADDR, LUT_HOOK_PATCH);
        if (!Arrays.equals(readBytes(t, LUT_HOOK_ADDR, 4), LUT_HOOK_PATCH)) {
            throw new Exception("Hook 0x868243C0 回读校验不一致");
        }
        done++;

        byte[] targetPlay = playbackFix ? LUT_PLAYBACK_PATCH : LUT_PLAYBACK_ORIG;
        writeHalfwords(t, LUT_PLAYBACK_ADDR, targetPlay);
        if (!Arrays.equals(readBytes(t, LUT_PLAYBACK_ADDR, 2), targetPlay)) {
            throw new Exception("回放补丁 0x866AE770 回读校验不一致");
        }
        if (listener != null) listener.onProgress(totalHw, totalHw);

        JSONObject out = new JSONObject();
        out.put("ok", true);
        out.put("enabled", true);
        out.put("mode", mode);
        out.put("playbackFix", playbackFix);
        out.put("payloadBytes", payloadBytes.length);
        return out;
    }

    public static JSONObject writeLutSlot(Transport t, int slot, byte[] beefBytes, ProgressListener listener) throws Exception {
        if (slot < 0 || slot > 4) {
            throw new IllegalArgumentException("slot must be 0..4");
        }
        if (beefBytes == null || beefBytes.length != 2920 || u32LE(beefBytes, 0) != 0x0001BEEFL) {
            throw new IllegalArgumentException("无效的 0xBEEF LUT 数据");
        }
        int ver = readBodyVersion(t);
        if (ver != VERIFIED_BODY_VERSION) {
            throw new UnsupportedFirmwareException("仅支持初代 DC-S5 (MC801) 固件 2.9");
        }
        long ptr = u32LE(readBytes(t, LUT_SLOTS_PTR_ADDR + (long) slot * 4L, 4), 0);
        if (ptr < 0x062B6000L || ptr > 0x062B9C00L) {
            throw new Exception("LUT 槽位指针异常: " + hexAddr(ptr));
        }
        long targetAddr = ptr | 0x80000000L;
        int totalHw = beefBytes.length / 2;
        for (int off = 0; off < beefBytes.length; off += 2) {
            int val = (beefBytes[off] & 0xFF) | ((beefBytes[off + 1] & 0xFF) << 8);
            t.writeHalf(targetAddr + off, val);
            int done = off / 2 + 1;
            if (listener != null && (done % 64 == 0 || done == totalHw)) {
                listener.onProgress(done, totalHw);
            }
        }
        if (!Arrays.equals(readBytes(t, targetAddr, beefBytes.length), beefBytes)) {
            throw new Exception("LUT 槽位回读校验不一致");
        }
        JSONObject out = new JSONObject();
        out.put("ok", true);
        out.put("slot", slot);
        out.put("addr", hexAddr(targetAddr));
        out.put("bytes", beefBytes.length);
        return out;
    }

    public static String classifyBlock(byte[] block) {
        boolean all55 = true;
        boolean all00 = true;
        for (byte b : block) {
            int v = b & 0xFF;
            if (v != 0x55) all55 = false;
            if (v != 0x00) all00 = false;
            if (!all55 && !all00) break;
        }
        if (all55) return "free-0x55";
        if (all00) return "zero";
        if (decodeHeader(block) != null) return "lumixtool";
        return "data";
    }

    public static JSONObject scanScratch(Transport t, ProgressListener listener) throws Exception {
        long length = SCRATCH_END - SCRATCH_START;
        int totalBlocks = (int) (length / BLOCK_DATA_LEN);
        List<String> labels = new ArrayList<>(totalBlocks);
        for (int i = 0; i < totalBlocks; i++) {
            byte[] block = t.readBlock(SCRATCH_START + (long) i * BLOCK_DATA_LEN);
            labels.add(classifyBlock(block));
            if (listener != null && ((i + 1) % 64 == 0 || i + 1 == totalBlocks)) {
                listener.onProgress(i + 1, totalBlocks);
            }
        }
        JSONArray runs = new JSONArray();
        long runStart = SCRATCH_START;
        String currentKind = labels.get(0);
        for (int i = 1; i < totalBlocks; i++) {
            String kind = labels.get(i);
            if (!kind.equals(currentKind)) {
                long runEnd = SCRATCH_START + (long) i * BLOCK_DATA_LEN;
                runs.put(makeRun(runStart, runEnd, currentKind));
                runStart = runEnd;
                currentKind = kind;
            }
        }
        runs.put(makeRun(runStart, SCRATCH_END, currentKind));

        JSONObject out = new JSONObject();
        out.put("ok", true);
        out.put("start", hexAddr(SCRATCH_START));
        out.put("length", length);
        out.put("runs", runs);
        return out;
    }

    private static JSONObject makeRun(long start, long end, String kind) throws Exception {
        JSONObject run = new JSONObject();
        run.put("start", hexAddr(start));
        run.put("end", hexAddr(end));
        run.put("kind", kind);
        run.put("kib", (end - start) / BLOCK_DATA_LEN);
        return run;
    }

    public static JSONObject applySlot(Transport t, int index, byte[] pcm, int samples, long regionAddr,
                                       ProgressListener listener) throws Exception {
        byte[] header = encodeHeader(index, samples);
        validateRegion(regionAddr, samples);
        if (pcm == null || pcm.length != samples * 2) {
            throw new IllegalArgumentException("PCM size mismatch");
        }
        requireWritable(t);

        byte[] guardBytes = readBytes(t, regionAddr, HEADER_SIZE + pcm.length + TAIL_GUARD_BYTES);
        int[] oldHeader = decodeHeader(guardBytes);
        if ((oldHeader != null && regionAddr + HEADER_SIZE + (long) oldHeader[1] * 2L > SCRATCH_END)
                || !regionIsFree(guardBytes, index)) {
            throw new RegionNotFreeException(regionAddr);
        }

        writeHalfwords(t, regionAddr, header);
        int tailSamples = TAIL_GUARD_BYTES / 2;
        int totalHalfwords = samples + tailSamples;
        for (int i = 0; i < totalHalfwords; i++) {
            int half = i < samples ? ((pcm[i * 2] & 0xFF) | ((pcm[i * 2 + 1] & 0xFF) << 8)) : 0;
            t.writeHalf(regionAddr + HEADER_SIZE + (long) i * 2L, half);
            if (listener != null && ((i + 1) % 500 == 0 || i + 1 == totalHalfwords)) {
                int done = (i + 1 == totalHalfwords) ? samples : Math.max(1, (int) (((long) (i + 1) * samples) / totalHalfwords));
                listener.onProgress(done, samples);
            }
        }

        long pcmVirt = regionAddr + HEADER_SIZE - 0x80000000L;
        long entryBase = SOUND_TABLE_ADDR + (long) index * ENTRY_SIZE;
        byte[] virtWord = new byte[4];
        byte[] byteLenWord = new byte[4];
        putU32LE(virtWord, 0, pcmVirt);
        putU32LE(byteLenWord, 0, (long) samples * 2L);
        writeHalfwords(t, entryBase + 4, virtWord);
        writeHalfwords(t, entryBase + 0x14, byteLenWord);

        byte[] readback = readBytes(t, entryBase, ENTRY_SIZE);
        boolean ok = u32LE(readback, 4) == pcmVirt && u32LE(readback, 0x14) == (long) samples * 2L;
        JSONObject res = new JSONObject();
        res.put("ok", ok);
        res.put("index", index);
        res.put("entry", toHex(readback));
        res.put("error", ok ? JSONObject.NULL : "table verification failed");
        return res;
    }

    public static JSONObject restoreSlot(Transport t, int index, String hex32) throws Exception {
        validateIndex(index);
        if (hex32 == null || hex32.length() != 64) {
            throw new IllegalArgumentException("原始表项必须为 32 字节 hex");
        }
        byte[] raw = fromHex(hex32);
        String problem = entryProblem(raw, index);
        if (problem != null || !isStockAddress(u32LE(raw, 4))) {
            throw new IllegalArgumentException("拒绝恢复: " + (problem != null
                    ? problem : "saved entry does not point into the firmware program image"));
        }
        requireWritable(t);
        long entryBase = SOUND_TABLE_ADDR + (long) index * ENTRY_SIZE;
        writeHalfwords(t, entryBase, raw);
        byte[] readback = readBytes(t, entryBase, ENTRY_SIZE);
        boolean ok = Arrays.equals(readback, raw);
        JSONObject res = new JSONObject();
        res.put("ok", ok);
        res.put("index", index);
        res.put("entry", toHex(readback));
        if (!ok) res.put("error", "恢复表项回读校验未通过");
        return res;
    }

    public static void verifyUnlockSignatures(Transport t) throws Exception {
        for (long[] sig : SIG_CHECKS) {
            long addr = sig[0];
            int got = t.readHalf(addr) & 0xFFFF;
            if (got != (int) sig[1] && (sig[2] == -1L || got != (int) sig[2])) {
                throw new UnsupportedFirmwareException(String.format(Locale.US,
                        "固件特征不匹配 (%s = 0x%04X)，仅支持初代 DC-S5 (MC801) 固件 2.9",
                        hexAddr(addr), got));
            }
        }
    }

    public static JSONObject inspectUnlock(Transport t) throws Exception {
        JSONObject info = new JSONObject();
        info.put("totalAnchors", SIG_CHECKS.length);
        info.put("totalPatches", UNLOCK_PATCHES.length);
        try {
            verifyUnlockSignatures(t);
            int unlockedWords = 0;
            int stockWords = 0;
            for (long[] patch : UNLOCK_PATCHES) {
                int v = t.readHalf(patch[0]) & 0xFFFF;
                if (v == (int) patch[1]) unlockedWords++;
                if (v == (int) patch[2]) stockWords++;
            }
            int capWord = t.readHalf(0x868261B6L) & 0xFFFF;
            boolean unlocked = unlockedWords == UNLOCK_PATCHES.length || capWord == 0x2000;
            info.put("supported", true);
            info.put("firmware", "MC801 2.9");
            info.put("unlocked", unlocked);
            info.put("fullyUnlocked", unlockedWords == UNLOCK_PATCHES.length);
            info.put("stock", stockWords == UNLOCK_PATCHES.length);
            info.put("unlockedWords", unlockedWords);
            info.put("verifiedAnchors", SIG_CHECKS.length);
        } catch (Exception err) {
            info.put("supported", false);
            info.put("unlocked", false);
            info.put("error", err.getMessage());
        }
        return info;
    }

    public static JSONObject applyUnlock(Transport t, boolean unlock, ProgressListener listener) throws Exception {
        JSONArray logs = new JSONArray();
        verifyUnlockSignatures(t);
        logs.put(String.format(Locale.US, "特征校验通过：MC801 固件 2.9（%d/%d 锚点吻合）",
                SIG_CHECKS.length, SIG_CHECKS.length));

        for (int i = 0; i < UNLOCK_PATCHES.length; i++) {
            long addr = UNLOCK_PATCHES[i][0];
            int target = (int) (unlock ? UNLOCK_PATCHES[i][1] : UNLOCK_PATCHES[i][2]);
            t.writeHalf(addr, target);
            int readback = t.readHalf(addr) & 0xFFFF;
            if (readback != target) {
                throw new Exception(String.format(Locale.US,
                        "回读校验不一致 %s：实际 0x%04X，期望 0x%04X",
                        hexAddr(addr), readback, target));
            }
            if (listener != null) {
                listener.onProgress(i + 1, UNLOCK_PATCHES.length);
            }
        }
        logs.put(unlock
                ? "写入并校验完成：19/19 半字生效（6K 片门全开 + 5.9K + 不限时录制 + 电源开关记忆）"
                : "恢复并校验完成：19/19 半字已还原为原厂默认状态");

        JSONObject out = new JSONObject();
        out.put("ok", true);
        out.put("unlocked", unlock);
        out.put("verifiedWords", UNLOCK_PATCHES.length);
        out.put("logs", logs);
        return out;
    }
}
