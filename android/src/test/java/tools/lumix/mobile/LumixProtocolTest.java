package tools.lumix.mobile;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.Assert.*;

public class LumixProtocolTest {
    @Rule
    public TemporaryFolder tempFolder = new TemporaryFolder();

    @Test
    public void wireFramesMatchS5SvcAndUnlockerSpec() throws Exception {
        byte[] rh = LumixProtocol.buildReadHalfFrame(0x868261B6L);
        assertEquals(16, rh.length);
        assertEquals(0x08, rh[0] & 0xFF);
        assertEquals(0x00, rh[1] & 0xFF);
        assertEquals(0xFF, rh[2] & 0xFF);
        assertEquals(0x9B, rh[3] & 0xFF);
        assertEquals(0x868261B6L, LumixProtocol.u32LE(rh, 4));
        assertEquals(LumixProtocol.frameSum(rh, 16), rh[14] & 0xFF);
        assertEquals(0, rh[15]);

        byte[] wh = LumixProtocol.buildWriteHalfFrame(0x868261B6L, 0x2000);
        assertEquals(16, wh.length);
        assertEquals(0x9C, wh[3] & 0xFF);
        assertEquals(0x00, wh[8] & 0xFF);
        assertEquals(0x20, wh[9] & 0xFF);
        assertEquals(LumixProtocol.frameSum(wh, 16), wh[14] & 0xFF);

        byte[] blk = LumixProtocol.buildReadBlockFrame(0x80000000L);
        assertEquals(1030, blk.length);
        assertEquals(0x01, blk[0] & 0xFF);
        assertEquals(0x5C, blk[3] & 0xFF);
        assertEquals(0x80000000L, LumixProtocol.u32LE(blk, 4));
        assertEquals(0x80000400L, LumixProtocol.u32LE(blk, 8));
        assertEquals(LumixProtocol.frameSum(blk, 1030), blk[1028] & 0xFF);
        assertEquals(0, blk[1029]);
    }

    @Test
    public void soundBurnScanGuardAndRestoreLifecycle() throws Exception {
        MockCameraTransport cam = new MockCameraTransport(false);
        LumixStorage storage = new LumixStorage(tempFolder.newFolder("lumix-store"));

        JSONObject inspected = LumixProtocol.inspectServiceDevice(cam);
        assertTrue(inspected.getBoolean("connected"));
        assertTrue(inspected.getBoolean("verified"));
        assertEquals("0x0290", inspected.getString("body_version"));
        assertFalse(inspected.getBoolean("custom"));

        JSONArray entries = inspected.getJSONArray("entries");
        assertEquals(28, entries.length());
        JSONObject synced = storage.syncSoundTable("0x0290", entries, false);
        assertTrue(synced.getBoolean("ok"));
        assertEquals(28, synced.getJSONObject("originals").length());
        String stockSlot1 = synced.getJSONObject("originals").getString("1");

        // Scan 8 MiB scratch RAM
        AtomicInteger scanProgressCalls = new AtomicInteger();
        JSONObject scan = LumixProtocol.scanScratch(cam, (done, total) -> {
            assertEquals(8192, total);
            scanProgressCalls.incrementAndGet();
        });
        assertTrue(scan.getBoolean("ok"));
        assertTrue(scanProgressCalls.get() > 0);
        assertEquals("0x8F000000", scan.getString("start"));

        // Apply custom PCM to slot #1 at 0x8F000000
        int samples = 1200;
        byte[] pcm = new byte[samples * 2];
        for (int i = 0; i < samples; i++) {
            int val = (i * 37) & 0x7FFF;
            pcm[i * 2] = (byte) (val & 0xFF);
            pcm[i * 2 + 1] = (byte) ((val >>> 8) & 0xFF);
        }
        JSONObject applyRes = LumixProtocol.applySlot(cam, 1, pcm, samples, 0x8F000000L, null);
        assertTrue(applyRes.getBoolean("ok"));

        // Verify slot #1 now points to virtual 0x0F000010 and length = samples * 2,
        // and that the 2 KiB silent DMA guard zone immediately following PCM is zeroed.
        JSONObject afterApply = LumixProtocol.inspectServiceDevice(cam);
        assertTrue(afterApply.getBoolean("custom"));
        assertEquals("0x0F000010", afterApply.getString("id1_addr"));
        assertEquals(samples * 2L, afterApply.getLong("id1_bytes"));
        long tailStart = 0x8F000000L + LumixProtocol.HEADER_SIZE + samples * 2L;
        for (int off = 0; off < LumixProtocol.TAIL_GUARD_BYTES; off += 2) {
            assertEquals(0, cam.readHalf(tailStart + off));
        }

        // Re-syncing sound table must NOT overwrite original stock backup of slot #1
        JSONObject resynced = storage.syncSoundTable("0x0290", afterApply.getJSONArray("entries"), false);
        assertEquals(stockSlot1, resynced.getJSONObject("originals").getString("1"));

        // Writing slot #2 at 0x8F000000 must fail guard with RegionNotFreeException (owned by slot #1)
        try {
            LumixProtocol.applySlot(cam, 2, pcm, samples, 0x8F000000L, null);
            fail("Expected RegionNotFreeException when slot #1 header occupies 0x8F000000");
        } catch (LumixProtocol.RegionNotFreeException err) {
            assertEquals("0x8F000000", err.address);
        }

        // Rewriting same slot #1 at 0x8F000000 succeeds
        JSONObject rewriteSame = LumixProtocol.applySlot(cam, 1, pcm, samples, 0x8F000000L, null);
        assertTrue(rewriteSame.getBoolean("ok"));

        // Restore slot #1 back to stock
        JSONObject restored = LumixProtocol.restoreSlot(cam, 1, stockSlot1);
        assertTrue(restored.getBoolean("ok"));
        JSONObject afterRestore = LumixProtocol.inspectServiceDevice(cam);
        assertFalse(afterRestore.getBoolean("custom"));
    }

    @Test
    public void unverifiedFirmwareBlocksSoundWrites() throws Exception {
        MockCameraTransport cam = new MockCameraTransport(false);
        cam.setBodyVersion(0x0280);
        byte[] pcm = new byte[200];
        try {
            LumixProtocol.applySlot(cam, 1, pcm, 100, 0x8F000000L, null);
            fail("Expected UnsupportedFirmwareException on 0x0280");
        } catch (LumixProtocol.UnsupportedFirmwareException expected) {
            assertTrue(expected.getMessage().contains("0x0280"));
        }
    }

    @Test
    public void s5UnlockerVerifies13AnchorsAndPatchesAndRestores19Words() throws Exception {
        MockCameraTransport cam = new MockCameraTransport(false);

        JSONObject before = LumixProtocol.inspectUnlock(cam);
        assertTrue(before.getBoolean("supported"));
        assertFalse(before.getBoolean("unlocked"));
        assertTrue(before.getBoolean("stock"));

        // Apply unlock
        JSONObject unlockRes = LumixProtocol.applyUnlock(cam, true, null);
        assertTrue(unlockRes.getBoolean("ok"));
        assertTrue(unlockRes.getBoolean("unlocked"));
        assertEquals(19, unlockRes.getInt("verifiedWords"));
        assertEquals(0x2000, cam.readHalf(0x868261B6L));
        assertEquals(0x00F1, cam.readHalf(0x86F15E90L));
        assertEquals(0x00ED, cam.readHalf(0x86F15E94L));
        assertEquals(0x00ED, cam.readHalf(0x08A6846CL));

        JSONObject mid = LumixProtocol.inspectUnlock(cam);
        assertTrue(mid.getBoolean("supported"));
        assertTrue(mid.getBoolean("unlocked"));
        assertTrue(mid.getBoolean("fullyUnlocked"));

        // Restore stock
        JSONObject restoreRes = LumixProtocol.applyUnlock(cam, false, null);
        assertTrue(restoreRes.getBoolean("ok"));
        assertFalse(restoreRes.getBoolean("unlocked"));
        assertEquals(0x4628, cam.readHalf(0x868261B6L));
        assertEquals(0x00D1, cam.readHalf(0x86F15E90L));
        assertEquals(0x00D2, cam.readHalf(0x86F15E94L));

        // Corrupting one signature anchor must abort unlock before writing any patch word
        cam.writeHalf(0x866B493AL, 0xDEAD);
        try {
            LumixProtocol.applyUnlock(cam, true, null);
            fail("Expected signature check to abort unlock");
        } catch (LumixProtocol.UnsupportedFirmwareException expected) {
            assertEquals(0x4628, cam.readHalf(0x868261B6L));
        }
    }
}
