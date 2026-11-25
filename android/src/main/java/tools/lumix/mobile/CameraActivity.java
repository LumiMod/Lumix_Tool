package tools.lumix.mobile;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.hardware.usb.UsbConstants;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbDeviceConnection;
import android.hardware.usb.UsbManager;
import android.mtp.MtpDevice;
import android.mtp.MtpDeviceInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Base64;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.widget.FrameLayout;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

public final class CameraActivity extends Activity {
    private static final String PERMISSION = "tools.lumix.mobile.USB_PERMISSION";
    static final String GITHUB_URL = "https://github.com/USER-HFC/Lumix_Tool";

    static boolean isAllowedExternalUrl(String url) {
        return GITHUB_URL.equals(url);
    }

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final AtomicBoolean operationLock = new AtomicBoolean(false);
    private final MockCameraTransport mockCamera = new MockCameraTransport(true);

    private UsbManager usb;
    private LumixStorage storage;
    private MobileView web;
    private volatile boolean mockMode = false;

    private volatile CountDownLatch permissionLatch;
    private volatile int permissionTargetId = -1;

    private volatile String pendingExportRequestId;
    private volatile String pendingExportJson;

    private final BroadcastReceiver receiver = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            String action = intent.getAction();
            UsbDevice device = getUsbDeviceExtra(intent);
            if (PERMISSION.equals(action)) {
                if (device != null && device.getDeviceId() == permissionTargetId && permissionLatch != null) {
                    permissionLatch.countDown();
                }
                emitUsbChanged("permission");
            } else if (UsbManager.ACTION_USB_DEVICE_ATTACHED.equals(action)) {
                if (device != null && device.getVendorId() == LumixProtocol.VID) {
                    emitUsbChanged("attached");
                }
            } else if (UsbManager.ACTION_USB_DEVICE_DETACHED.equals(action)) {
                if (device != null && device.getVendorId() == LumixProtocol.VID) {
                    emitUsbChanged("detached");
                }
            }
        }
    };

    @SuppressWarnings("deprecation")
    private static UsbDevice getUsbDeviceExtra(Intent intent) {
        if (intent == null) return null;
        if (Build.VERSION.SDK_INT >= 33) {
            return intent.getParcelableExtra(UsbManager.EXTRA_DEVICE, UsbDevice.class);
        }
        return intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
    }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        usb = (UsbManager) getSystemService(USB_SERVICE);
        storage = new LumixStorage(getFilesDir());
        web = new MobileView(this, this::handleRpc);

        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        if (Build.VERSION.SDK_INT >= 29) {
            getWindow().setNavigationBarContrastEnforced(false);
            getWindow().setStatusBarContrastEnforced(false);
        }
        FrameLayout frame = new FrameLayout(this);
        frame.setBackgroundColor(getColor(R.color.lumix_surface));
        frame.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets safe = insets.getInsets(WindowInsets.Type.systemBars()
                        | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                view.setPadding(safe.left, safe.top, safe.right, safe.bottom);
                return WindowInsets.CONSUMED;
            }
            view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                    insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets.consumeSystemWindowInsets();
        });
        frame.addView(web);
        setContentView(frame);

        IntentFilter filter = new IntentFilter(PERMISSION);
        filter.addAction(UsbManager.ACTION_USB_DEVICE_ATTACHED);
        filter.addAction(UsbManager.ACTION_USB_DEVICE_DETACHED);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(receiver, filter, RECEIVER_NOT_EXPORTED);
        else registerReceiver(receiver, filter);
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (intent != null && UsbManager.ACTION_USB_DEVICE_ATTACHED.equals(intent.getAction())) {
            emitUsbChanged("attached");
        }
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == MobileView.PICK_AUDIO) {
            web.finishPicker(result, data);
        } else if (request == MobileView.SAVE_JSON) {
            finishExportJson(result, data);
        }
    }

    private void emitUsbChanged(String reason) {
        runOnUiThread(() -> {
            if (isDestroyed()) return;
            try {
                JSONObject detail = new JSONObject();
                detail.put("reason", reason);
                web.emitEvent("lumix-usb", detail);
            } catch (Exception ignored) {}
        });
    }

    private void emitProgress(JSONObject progress) {
        runOnUiThread(() -> {
            if (!isDestroyed()) web.emitEvent("lumix-progress", progress);
        });
    }

    private void setKeepScreenOn(boolean keepOn) {
        runOnUiThread(() -> {
            if (isDestroyed()) return;
            if (keepOn) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        });
    }

    private void handleRpc(String requestId, String method, String payloadJson) {
        if ("openExternal".equals(method)) {
            try {
                JSONObject args = parsePayload(payloadJson);
                String url = args.optString("url", "");
                if (!isAllowedExternalUrl(url)) {
                    JSONObject err = new JSONObject();
                    err.put("ok", false);
                    err.put("error", "不允许打开此链接。");
                    final JSONObject out = err;
                    runOnUiThread(() -> web.resolve(requestId, out));
                    return;
                }
                runOnUiThread(() -> {
                    JSONObject res = new JSONObject();
                    try {
                        Intent view = new Intent(Intent.ACTION_VIEW, Uri.parse(url))
                                .addCategory(Intent.CATEGORY_BROWSABLE);
                        startActivity(view);
                        res.put("ok", true);
                    } catch (Exception e) {
                        putError(res, e);
                    }
                    web.resolve(requestId, res);
                });
            } catch (Exception e) {
                JSONObject err = new JSONObject();
                putError(err, e);
                final JSONObject out = err;
                runOnUiThread(() -> web.resolve(requestId, out));
            }
            return;
        }

        if ("setMock".equals(method)) {
            executor.execute(() -> {
                JSONObject res = new JSONObject();
                try {
                    if (operationLock.get()) {
                        res.put("ok", false);
                        res.put("error", "相机操作进行中，请稍候切换模式。");
                    } else {
                        JSONObject args = parsePayload(payloadJson);
                        if (args.has("enabled")) {
                            mockMode = args.getBoolean("enabled");
                        }
                        if (args.optBoolean("reset", false)) {
                            mockCamera.reset();
                        }
                        if (args.has("bodyVersion")) {
                            mockCamera.setBodyVersion(args.getInt("bodyVersion"));
                        }
                        res.put("ok", true);
                        res.put("mock", mockMode);
                    }
                } catch (Exception e) {
                    putError(res, e);
                }
                final JSONObject out = res;
                runOnUiThread(() -> web.resolve(requestId, out));
            });
            return;
        }

        if ("exportMemory".equals(method) || "saveVlt".equals(method)) {
            executor.execute(() -> {
                try {
                    JSONObject args = parsePayload(payloadJson);
                    String fileName;
                    String mimeType;
                    String content;
                    if ("saveVlt".equals(method)) {
                        content = args.optString("content", "");
                        if (content.isEmpty()) {
                            JSONObject err = new JSONObject();
                            err.put("ok", false);
                            err.put("error", "VLT 内容为空。");
                            runOnUiThread(() -> web.resolve(requestId, err));
                            return;
                        }
                        fileName = args.optString("filename", "CUSTOM.VLT");
                        mimeType = "application/octet-stream";
                    } else {
                        String version = args.optString("version", "");
                        JSONObject map = storage.loadMemoryMap(version, mockMode);
                        if (map == null) {
                            JSONObject err = new JSONObject();
                            err.put("ok", false);
                            err.put("error", "请先执行一次内存扫描。");
                            runOnUiThread(() -> web.resolve(requestId, err));
                            return;
                        }
                        content = map.toString(2);
                        fileName = "LumixTool-memory-" + map.optString("bodyVersion", "s5") + ".json";
                        mimeType = "application/json";
                    }
                    pendingExportRequestId = requestId;
                    pendingExportJson = content;
                    final String finalMime = mimeType;
                    final String finalName = fileName;
                    runOnUiThread(() -> {
                        try {
                            Intent save = new Intent(Intent.ACTION_CREATE_DOCUMENT)
                                    .addCategory(Intent.CATEGORY_OPENABLE)
                                    .setType(finalMime)
                                    .putExtra(Intent.EXTRA_TITLE, finalName);
                            startActivityForResult(save, MobileView.SAVE_JSON);
                        } catch (Exception e) {
                            JSONObject err = new JSONObject();
                            putError(err, e);
                            pendingExportRequestId = null;
                            pendingExportJson = null;
                            web.resolve(requestId, err);
                        }
                    });
                } catch (Exception e) {
                    JSONObject err = new JSONObject();
                    putError(err, e);
                    runOnUiThread(() -> web.resolve(requestId, err));
                }
            });
            return;
        }

        if ("saveMemoryMap".equals(method)) {
            executor.execute(() -> {
                JSONObject res = new JSONObject();
                try {
                    JSONObject args = parsePayload(payloadJson);
                    storage.saveMemoryMap(args.getJSONObject("map"), mockMode);
                    res.put("ok", true);
                } catch (Exception e) {
                    putError(res, e);
                }
                final JSONObject out = res;
                runOnUiThread(() -> web.resolve(requestId, out));
            });
            return;
        }

        if ("renameSound".equals(method)) {
            executor.execute(() -> {
                JSONObject res;
                try {
                    JSONObject args = parsePayload(payloadJson);
                    res = storage.renameSound(
                            args.optString("version", ""),
                            args.getInt("index"),
                            args.optString("label", ""),
                            mockMode);
                } catch (Exception e) {
                    res = new JSONObject();
                    putError(res, e);
                }
                final JSONObject out = res;
                runOnUiThread(() -> web.resolve(requestId, out));
            });
            return;
        }

        executor.execute(() -> {
            if (!operationLock.compareAndSet(false, true)) {
                JSONObject busyRes = new JSONObject();
                try {
                    busyRes.put("ok", false);
                    busyRes.put("busy", true);
                    busyRes.put("error", "另一个相机操作正在进行，请等待完成。");
                } catch (Exception ignored) {}
                runOnUiThread(() -> web.resolve(requestId, busyRes));
                return;
            }

            boolean longRunning = "scanMemory".equals(method) || "applySlots".equals(method)
                    || "restoreSlots".equals(method) || "setUnlock".equals(method)
                    || "setLut".equals(method) || "uploadLutSlot".equals(method);
            if (longRunning) setKeepScreenOn(true);

            JSONObject result;
            try {
                JSONObject args = parsePayload(payloadJson);
                switch (method) {
                    case "status":
                        result = rpcStatus(args.optBoolean("requestPermission", true));
                        break;
                    case "scanMemory":
                        result = rpcScanMemory();
                        break;
                    case "applySlots":
                        result = rpcApplySlots(args);
                        break;
                    case "restoreSlots":
                        result = rpcRestoreSlots(args);
                        break;
                    case "setUnlock":
                        result = rpcSetUnlock(args.getBoolean("unlock"));
                        break;
                    case "setLut":
                        result = rpcSetLut(args);
                        break;
                    case "uploadLutSlot":
                        result = rpcUploadLutSlot(args);
                        break;
                    default:
                        result = new JSONObject();
                        result.put("ok", false);
                        result.put("error", "未知命令: " + method);
                        break;
                }
            } catch (Exception e) {
                result = new JSONObject();
                putError(result, e);
            } finally {
                if (longRunning) setKeepScreenOn(false);
                operationLock.set(false);
            }

            final JSONObject out = result;
            runOnUiThread(() -> web.resolve(requestId, out));
        });
    }

    private void finishExportJson(int resultCode, Intent data) {
        final String reqId = pendingExportRequestId;
        final String content = pendingExportJson;
        pendingExportRequestId = null;
        pendingExportJson = null;
        if (reqId == null) return;
        executor.execute(() -> {
            JSONObject res = new JSONObject();
            try {
                Uri uri = resultCode == Activity.RESULT_OK && data != null ? data.getData() : null;
                if (uri == null) {
                    res.put("ok", true);
                    res.put("canceled", true);
                } else {
                    try (OutputStream out = getContentResolver().openOutputStream(uri, "wt")) {
                        if (out == null) throw new Exception("无法写入所选文件");
                        out.write(content.getBytes(StandardCharsets.UTF_8));
                    }
                    res.put("ok", true);
                }
            } catch (Exception e) {
                putError(res, e);
            }
            final JSONObject out = res;
            runOnUiThread(() -> web.resolve(reqId, out));
        });
    }

    private static JSONObject parsePayload(String payloadJson) throws Exception {
        if (payloadJson == null || payloadJson.trim().isEmpty()) return new JSONObject();
        return new JSONObject(payloadJson);
    }

    private static void putError(JSONObject obj, Exception err) {
        try {
            obj.put("ok", false);
            obj.put("connected", false);
            String msg = err.getMessage();
            obj.put("error", (msg != null && !msg.isEmpty()) ? msg : err.getClass().getSimpleName());
            if (err instanceof LumixProtocol.RegionNotFreeException) {
                obj.put("address", ((LumixProtocol.RegionNotFreeException) err).address);
            }
        } catch (Exception ignored) {}
    }

    private UsbDevice findPanasonicServiceDevice() throws Exception {
        UsbDevice match = null;
        for (UsbDevice dev : usb.getDeviceList().values()) {
            if (dev.getVendorId() == LumixProtocol.VID && dev.getProductId() == LumixProtocol.SERVICE_PID) {
                if (match != null) {
                    throw new Exception("检测到多台服务模式相机，请仅连接需要操作的一台。");
                }
                match = dev;
            }
        }
        return match;
    }

    private UsbDevice findPanasonicPtpDevice() {
        for (UsbDevice dev : usb.getDeviceList().values()) {
            if (dev.getVendorId() != LumixProtocol.VID || dev.getProductId() == LumixProtocol.SERVICE_PID) {
                continue;
            }
            for (int i = 0; i < dev.getInterfaceCount(); i++) {
                if (dev.getInterface(i).getInterfaceClass() == UsbConstants.USB_CLASS_STILL_IMAGE) {
                    return dev;
                }
            }
        }
        return null;
    }

    private boolean ensurePermission(UsbDevice device, boolean promptIfNeeded) throws InterruptedException {
        if (usb.hasPermission(device)) return true;
        if (!promptIfNeeded || isDestroyed()) return false;

        CountDownLatch latch = new CountDownLatch(1);
        permissionTargetId = device.getDeviceId();
        permissionLatch = latch;
        runOnUiThread(() -> {
            if (isDestroyed()) {
                latch.countDown();
                return;
            }
            Intent callback = new Intent(PERMISSION).setPackage(getPackageName());
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= 31) flags |= PendingIntent.FLAG_MUTABLE;
            PendingIntent pi = PendingIntent.getBroadcast(this, device.getDeviceId(), callback, flags);
            usb.requestPermission(device, pi);
        });
        latch.await(30, TimeUnit.SECONDS);
        permissionLatch = null;
        permissionTargetId = -1;
        return usb.hasPermission(device);
    }

    private interface TransportTask<T> {
        T run(LumixProtocol.Transport transport) throws Exception;
    }

    private <T> T withServiceTransport(boolean promptPermission, TransportTask<T> task) throws Exception {
        if (mockMode) {
            return task.run(mockCamera);
        }
        UsbDevice serviceDev = findPanasonicServiceDevice();
        if (serviceDev == null) {
            throw new Exception("未检测到服务模式相机 (04DA:2370)。请关机后按住【回放 PLAY + AF/AE LOCK】开机，再连接 OTG 数据线。");
        }
        if (!ensurePermission(serviceDev, promptPermission)) {
            throw new Exception("未获得系统 USB 授权，请点击连接并在弹窗中允许访问。");
        }
        try (UsbServiceTransport transport = UsbServiceTransport.open(usb, serviceDev)) {
            return task.run(transport);
        }
    }

    private JSONObject rpcStatus(boolean requestPermission) throws Exception {
        if (mockMode) {
            JSONObject inspected = LumixProtocol.inspectServiceDevice(mockCamera);
            return attachLocalCaches(inspected, true);
        }

        UsbDevice serviceDev = findPanasonicServiceDevice();
        if (serviceDev != null) {
            if (!ensurePermission(serviceDev, requestPermission)) {
                JSONObject out = new JSONObject();
                out.put("ok", false);
                out.put("connected", false);
                out.put("mode", "service-unauthorized");
                out.put("mock", false);
                out.put("error", "检测到服务模式相机 (04DA:2370)，等待授予 USB 访问权限。");
                return out;
            }
            try (UsbServiceTransport transport = UsbServiceTransport.open(usb, serviceDev)) {
                JSONObject inspected = LumixProtocol.inspectServiceDevice(transport);
                return attachLocalCaches(inspected, false);
            }
        }

        UsbDevice ptpDev = findPanasonicPtpDevice();
        if (ptpDev != null) {
            JSONObject ptp = new JSONObject();
            ptp.put("ok", true);
            ptp.put("connected", false);
            ptp.put("mode", "ptp");
            ptp.put("mock", false);
            if (ensurePermission(ptpDev, requestPermission)) {
                UsbDeviceConnection conn = usb.openDevice(ptpDev);
                if (conn != null) {
                    MtpDevice camera = new MtpDevice(ptpDev);
                    try {
                        if (camera.open(conn)) {
                            MtpDeviceInfo info = camera.getDeviceInfo();
                            if (info != null) {
                                ptp.put("manufacturer", info.getManufacturer());
                                ptp.put("model", info.getModel());
                                ptp.put("ptpVersion", info.getVersion());
                            }
                        }
                    } finally {
                        camera.close();
                        conn.close();
                    }
                }
            }
            ptp.put("error", "当前相机处于普通 PTP 模式，无法写入音效或解锁规格。请先关机，按住【回放 PLAY + AF/AE LOCK】同时开机进入服务模式 (04DA:2370)。");
            return ptp;
        }

        JSONObject none = new JSONObject();
        none.put("ok", true);
        none.put("connected", false);
        none.put("mode", "none");
        none.put("mock", false);
        return none;
    }

    private JSONObject attachLocalCaches(JSONObject inspected, boolean mock) throws Exception {
        String version = inspected.optString("body_version", "");
        JSONArray entries = inspected.getJSONArray("entries");
        inspected.remove("entries");

        JSONObject soundTable = storage.syncSoundTable(version, entries, mock);
        JSONObject memoryMap = storage.loadMemoryMap(version, mock);
        inspected.put("ok", true);
        inspected.put("mock", mock);
        inspected.put("soundTable", soundTable);
        inspected.put("memoryMap", memoryMap != null ? memoryMap : JSONObject.NULL);
        if (!soundTable.optBoolean("ok", false)) {
            inspected.put("error", soundTable.optString("error", "读取音效表失败"));
        }
        return inspected;
    }

    private JSONObject rpcScanMemory() throws Exception {
        return withServiceTransport(true, transport -> {
            int ver = LumixProtocol.readBodyVersion(transport);
            String bodyVersion = LumixProtocol.hexWord(ver).toLowerCase();
            int totalBlocks = (int) ((LumixProtocol.SCRATCH_END - LumixProtocol.SCRATCH_START) / LumixProtocol.BLOCK_DATA_LEN);
            JSONObject initial = new JSONObject();
            initial.put("phase", "scan");
            initial.put("done", 0);
            initial.put("total", totalBlocks);
            emitProgress(initial);

            JSONObject scan = LumixProtocol.scanScratch(transport, (done, total) -> {
                try {
                    JSONObject p = new JSONObject();
                    p.put("phase", "scan");
                    p.put("done", done);
                    p.put("total", total);
                    emitProgress(p);
                } catch (Exception ignored) {}
            });

            JSONObject map = new JSONObject();
            map.put("scannedAt", Instant.now().toString());
            map.put("bodyVersion", bodyVersion);
            map.put("start", scan.getString("start"));
            map.put("length", scan.getLong("length"));
            map.put("runs", scan.getJSONArray("runs"));
            storage.saveMemoryMap(map, mockMode);

            JSONObject out = new JSONObject();
            out.put("ok", true);
            out.put("map", map);
            return out;
        });
    }

    private JSONObject rpcApplySlots(JSONObject args) throws Exception {
        String pcmBase64 = args.getString("pcmBase64");
        int samples = args.getInt("samples");
        String expectedVersion = args.optString("version", "");
        JSONArray allocations = args.getJSONArray("allocations");
        byte[] pcm = Base64.decode(pcmBase64, Base64.DEFAULT);
        if (samples < 1 || samples > LumixProtocol.MAX_SAMPLES || pcm.length != samples * 2) {
            throw new IllegalArgumentException("音频采样数据无效（最长 3 秒，44.1 kHz 16-bit 单声道）");
        }
        if (allocations.length() == 0 || allocations.length() > LumixProtocol.SLOT_COUNT) {
            throw new IllegalArgumentException("请选择有效的音效槽位（1..28 项）");
        }

        List<Integer> succeeded = new ArrayList<>();
        return withServiceTransport(true, transport -> {
            int ver = LumixProtocol.readBodyVersion(transport);
            String currentVer = LumixProtocol.hexWord(ver).toLowerCase();
            if (!expectedVersion.isEmpty() && !expectedVersion.equalsIgnoreCase(currentVer)) {
                throw new Exception("机身版本已变化，请刷新后再执行烧录。");
            }
            // Ensure stock entries are backed up before any write!
            byte[] beforeTable = LumixProtocol.readBytes(transport, LumixProtocol.SOUND_TABLE_ADDR,
                    LumixProtocol.SLOT_COUNT * LumixProtocol.ENTRY_SIZE);
            storage.syncSoundTable(currentVer, LumixProtocol.parseSoundEntries(beforeTable), mockMode);

            int count = allocations.length();
            int overallTotal = count * samples;

            for (int pos = 0; pos < count; pos++) {
                JSONObject alloc = allocations.getJSONObject(pos);
                int slotIndex = alloc.getInt("index");
                long regionAddr = alloc.getLong("start");
                int completedUnits = succeeded.size() * samples;

                JSONObject startProgress = new JSONObject();
                startProgress.put("phase", "apply");
                startProgress.put("index", slotIndex);
                startProgress.put("position", pos + 1);
                startProgress.put("count", count);
                startProgress.put("done", 0);
                startProgress.put("total", samples);
                startProgress.put("overallDone", completedUnits);
                startProgress.put("overallTotal", overallTotal);
                emitProgress(startProgress);

                try {
                    final int curPos = pos;
                    JSONObject itemRes = LumixProtocol.applySlot(transport, slotIndex, pcm, samples, regionAddr,
                            (done, total) -> {
                                try {
                                    JSONObject p = new JSONObject();
                                    p.put("phase", "apply");
                                    p.put("index", slotIndex);
                                    p.put("position", curPos + 1);
                                    p.put("count", count);
                                    p.put("done", done);
                                    p.put("total", total);
                                    p.put("overallDone", completedUnits + done);
                                    p.put("overallTotal", overallTotal);
                                    emitProgress(p);
                                } catch (Exception ignored) {}
                            });
                    if (!itemRes.optBoolean("ok", false)) {
                        return buildBatchFailure(itemRes.optString("error", "声表回读校验失败"),
                                null, slotIndex, succeeded, allocations, pos + 1, false);
                    }
                    succeeded.add(slotIndex);
                } catch (LumixProtocol.RegionNotFreeException regionErr) {
                    return buildBatchFailure("region not free", regionErr.address,
                            slotIndex, succeeded, allocations, pos + 1, true);
                } catch (Exception itemErr) {
                    return buildBatchFailure(itemErr.getMessage(), null,
                            slotIndex, succeeded, allocations, pos + 1, false);
                }
            }

            JSONObject ok = new JSONObject();
            ok.put("ok", true);
            ok.put("succeeded", new JSONArray(succeeded));
            return ok;
        });
    }

    private static JSONObject buildBatchFailure(String error, String address, int failedIndex,
                                                List<Integer> succeeded, JSONArray allocations,
                                                int nextPos, boolean rescan) throws Exception {
        JSONArray pending = new JSONArray();
        for (int i = nextPos; i < allocations.length(); i++) {
            pending.put(allocations.getJSONObject(i).getInt("index"));
        }
        JSONObject out = new JSONObject();
        out.put("ok", false);
        out.put("error", error != null ? error : "写入未完成");
        if (address != null) out.put("address", address);
        if (rescan) {
            out.put("code", "stale-map");
            out.put("rescan", true);
        }
        out.put("failedIndex", failedIndex);
        out.put("succeeded", new JSONArray(succeeded));
        out.put("pending", pending);
        return out;
    }

    private JSONObject rpcRestoreSlots(JSONObject args) throws Exception {
        String expectedVersion = args.optString("version", "");
        JSONArray requestedIndices = args.optJSONArray("indices");

        return withServiceTransport(true, transport -> {
            int ver = LumixProtocol.readBodyVersion(transport);
            String currentVer = LumixProtocol.hexWord(ver).toLowerCase();
            if (!expectedVersion.isEmpty() && !expectedVersion.equalsIgnoreCase(currentVer)) {
                throw new Exception("机身版本已变化，请刷新后再执行恢复。");
            }
            JSONObject originals = storage.getOriginals(currentVer, mockMode);
            List<Integer> targets = new ArrayList<>();
            if (requestedIndices != null && requestedIndices.length() > 0) {
                for (int i = 0; i < requestedIndices.length(); i++) {
                    targets.add(requestedIndices.getInt(i));
                }
            } else {
                for (int i = 0; i < LumixProtocol.SLOT_COUNT; i++) {
                    if (originals.has(String.valueOf(i))) targets.add(i);
                }
            }
            if (targets.isEmpty()) {
                throw new Exception("没有可用的原厂备份表项（拔下电池即可还原所有音效）。");
            }
            for (int idx : targets) {
                if (!originals.has(String.valueOf(idx))) {
                    throw new Exception("音效 #" + idx + " 无原厂备份，请通过拔电池还原。");
                }
            }

            List<Integer> succeeded = new ArrayList<>();
            int count = targets.size();
            for (int pos = 0; pos < count; pos++) {
                int idx = targets.get(pos);
                JSONObject p = new JSONObject();
                p.put("phase", "restore");
                p.put("index", idx);
                p.put("position", pos + 1);
                p.put("count", count);
                p.put("done", pos);
                p.put("total", count);
                p.put("overallDone", pos);
                p.put("overallTotal", count);
                emitProgress(p);

                try {
                    String hex = originals.getString(String.valueOf(idx));
                    JSONObject res = LumixProtocol.restoreSlot(transport, idx, hex);
                    if (!res.optBoolean("ok", false)) {
                        throw new Exception(res.optString("error", "恢复校验失败"));
                    }
                    succeeded.add(idx);
                    JSONObject doneP = new JSONObject();
                    doneP.put("phase", "restore");
                    doneP.put("index", idx);
                    doneP.put("position", pos + 1);
                    doneP.put("count", count);
                    doneP.put("done", pos + 1);
                    doneP.put("total", count);
                    doneP.put("overallDone", pos + 1);
                    doneP.put("overallTotal", count);
                    emitProgress(doneP);
                } catch (Exception err) {
                    JSONArray pending = new JSONArray();
                    for (int rest = pos + 1; rest < count; rest++) pending.put(targets.get(rest));
                    JSONObject fail = new JSONObject();
                    fail.put("ok", false);
                    fail.put("error", err.getMessage());
                    fail.put("failedIndex", idx);
                    fail.put("succeeded", new JSONArray(succeeded));
                    fail.put("pending", pending);
                    return fail;
                }
            }

            JSONObject ok = new JSONObject();
            ok.put("ok", true);
            ok.put("succeeded", new JSONArray(succeeded));
            return ok;
        });
    }

    private JSONObject rpcSetUnlock(boolean unlock) throws Exception {
        return withServiceTransport(true, transport -> LumixProtocol.applyUnlock(transport, unlock, (done, total) -> {
            try {
                JSONObject p = new JSONObject();
                p.put("phase", unlock ? "unlock" : "lock");
                p.put("done", done);
                p.put("total", total);
                emitProgress(p);
            } catch (Exception ignored) {}
        }));
    }

    private JSONObject loadLutPayloadsJson() throws Exception {
        try (java.io.InputStream is = getAssets().open("lut_payloads.json")) {
            java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            while ((n = is.read(buf)) > 0) bos.write(buf, 0, n);
            return new JSONObject(bos.toString(StandardCharsets.UTF_8.name()));
        }
    }

    private JSONObject rpcSetLut(JSONObject args) throws Exception {
        boolean enable = args.getBoolean("enable");
        String mode = args.optString("mode", "fast");
        boolean playbackFix = args.optBoolean("playbackFix", true);
        byte[] payload = null;
        if (enable) {
            JSONObject meta = loadLutPayloadsJson();
            String b64 = meta.getJSONObject(mode).getString("base64");
            payload = Base64.decode(b64, Base64.DEFAULT);
        }
        final byte[] finalPayload = payload;
        return withServiceTransport(true, transport -> LumixProtocol.applyLut(
                transport, enable, mode, playbackFix, finalPayload, (done, total) -> {
                    try {
                        JSONObject p = new JSONObject();
                        p.put("phase", enable ? "lut-enable" : "lut-restore");
                        p.put("done", done);
                        p.put("total", total);
                        emitProgress(p);
                    } catch (Exception ignored) {}
                }));
    }

    private JSONObject rpcUploadLutSlot(JSONObject args) throws Exception {
        int slot = args.getInt("slot");
        String b64 = args.getString("beefBase64");
        byte[] beefBytes = Base64.decode(b64, Base64.DEFAULT);
        return withServiceTransport(true, transport -> LumixProtocol.writeLutSlot(
                transport, slot, beefBytes, (done, total) -> {
                    try {
                        JSONObject p = new JSONObject();
                        p.put("phase", "lut-upload");
                        p.put("done", done);
                        p.put("total", total);
                        emitProgress(p);
                    } catch (Exception ignored) {}
                }));
    }

    @Override public void onBackPressed() {
        web.evaluateJavascript("Boolean(window.__lumixBack && window.__lumixBack())", value -> {
            if (!"true".equals(value)) {
                if (web.canGoBack()) web.goBack();
                else super.onBackPressed();
            }
        });
    }

    @Override protected void onDestroy() {
        if (permissionLatch != null) permissionLatch.countDown();
        try { unregisterReceiver(receiver); } catch (Exception ignored) {}
        executor.shutdownNow();
        web.destroy();
        super.onDestroy();
    }
}
