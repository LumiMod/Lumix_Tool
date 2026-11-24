package tools.lumix.mobile;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

/**
 * Atomic JSON storage for sound-table backups/labels and scratch memory maps,
 * isolated by body version and real vs mock mode (mirroring PC runtime.js).
 */
public final class LumixStorage {
    private final File baseDir;

    public LumixStorage(File baseDir) {
        this.baseDir = baseDir;
    }

    private File soundsFile(boolean mock) {
        return new File(baseDir, mock ? "sounds-mock.json" : "sounds.json");
    }

    private File memoryFile(boolean mock) {
        return new File(baseDir, mock ? "memory-maps-mock.json" : "memory-maps.json");
    }

    private synchronized JSONObject readJson(File file) throws Exception {
        if (!file.exists()) return new JSONObject();
        String text = new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8).trim();
        if (text.isEmpty()) return new JSONObject();
        return new JSONObject(text);
    }

    private synchronized void writeJsonAtomic(File file, JSONObject data) throws Exception {
        if (!baseDir.exists() && !baseDir.mkdirs() && !baseDir.exists()) {
            throw new Exception("无法创建本地存储目录");
        }
        File tmp = new File(baseDir, file.getName() + ".tmp");
        byte[] bytes = data.toString(2).getBytes(StandardCharsets.UTF_8);
        try (FileOutputStream out = new FileOutputStream(tmp)) {
            out.write(bytes);
            out.getFD().sync();
        }
        if (!tmp.renameTo(file)) {
            try (FileOutputStream out = new FileOutputStream(file)) {
                out.write(bytes);
                out.getFD().sync();
            }
            //noinspection ResultOfMethodCallIgnored
            tmp.delete();
        }
    }

    public synchronized JSONObject syncSoundTable(String bodyVersion, JSONArray entries, boolean mock) throws Exception {
        if (bodyVersion == null || !bodyVersion.matches("(?i)^0x[0-9a-f]{4}$")) {
            JSONObject err = new JSONObject();
            err.put("ok", false);
            err.put("error", "无法识别机身版本，未保存音效备份。");
            return err;
        }
        if (entries == null || entries.length() != LumixProtocol.SLOT_COUNT) {
            JSONObject err = new JSONObject();
            err.put("ok", false);
            err.put("error", "音效表数据不完整，未保存备份。");
            return err;
        }

        File file = soundsFile(mock);
        JSONObject allSounds = readJson(file);
        String key = bodyVersion.toLowerCase();
        JSONObject saved = allSounds.optJSONObject(key);
        if (saved == null) saved = new JSONObject();
        JSONObject originals = saved.optJSONObject("originals");
        if (originals == null) originals = new JSONObject();
        JSONObject labels = saved.optJSONObject("labels");
        if (labels == null) labels = new JSONObject();

        for (int i = 0; i < entries.length(); i++) {
            JSONObject entry = entries.getJSONObject(i);
            int idx = entry.getInt("index");
            String hex = entry.getString("hex");
            byte[] raw = LumixProtocol.fromHex(hex);
            long virtAddr = LumixProtocol.u32LE(raw, 4);
            String slotKey = String.valueOf(idx);
            if (LumixProtocol.isStockAddress(virtAddr) && !originals.has(slotKey)) {
                originals.put(slotKey, hex);
            }
        }

        saved.put("originals", originals);
        saved.put("labels", labels);
        allSounds.put(key, saved);
        writeJsonAtomic(file, allSounds);

        JSONObject result = new JSONObject();
        result.put("ok", true);
        result.put("version", key);
        result.put("entries", entries);
        result.put("originals", originals);
        result.put("labels", labels);
        return result;
    }

    public synchronized JSONObject getOriginals(String bodyVersion, boolean mock) throws Exception {
        if (bodyVersion == null) return new JSONObject();
        JSONObject allSounds = readJson(soundsFile(mock));
        JSONObject saved = allSounds.optJSONObject(bodyVersion.toLowerCase());
        if (saved == null) return new JSONObject();
        JSONObject originals = saved.optJSONObject("originals");
        return originals != null ? originals : new JSONObject();
    }

    public synchronized JSONObject renameSound(String bodyVersion, int index, String label, boolean mock) throws Exception {
        LumixProtocol.validateIndex(index);
        if (bodyVersion == null || !bodyVersion.matches("(?i)^0x[0-9a-f]{4}$")) {
            JSONObject err = new JSONObject();
            err.put("ok", false);
            err.put("error", "请先连接相机并读取音效表。");
            return err;
        }
        String trimmed = label == null ? "" : label.trim();
        if (trimmed.length() > 80) {
            JSONObject err = new JSONObject();
            err.put("ok", false);
            err.put("error", "音效名称最多 80 个字符。");
            return err;
        }
        File file = soundsFile(mock);
        JSONObject allSounds = readJson(file);
        String key = bodyVersion.toLowerCase();
        JSONObject saved = allSounds.optJSONObject(key);
        if (saved == null) {
            JSONObject err = new JSONObject();
            err.put("ok", false);
            err.put("error", "请先连接并读取音效表。");
            return err;
        }
        JSONObject labels = saved.optJSONObject("labels");
        if (labels == null) labels = new JSONObject();
        String slotKey = String.valueOf(index);
        if (trimmed.isEmpty()) labels.remove(slotKey);
        else labels.put(slotKey, trimmed);
        saved.put("labels", labels);
        allSounds.put(key, saved);
        writeJsonAtomic(file, allSounds);

        JSONObject res = new JSONObject();
        res.put("ok", true);
        res.put("labels", labels);
        return res;
    }

    public synchronized JSONObject loadMemoryMap(String bodyVersion, boolean mock) {
        try {
            if (bodyVersion == null || !bodyVersion.matches("(?i)^0x[0-9a-f]{4}$")) return null;
            String key = bodyVersion.toLowerCase();
            JSONObject maps = readJson(memoryFile(mock));
            JSONObject map = maps.optJSONObject(key);
            if (map != null && key.equalsIgnoreCase(map.optString("bodyVersion"))) {
                return map;
            }
            return null;
        } catch (Exception ignored) {
            return null;
        }
    }

    public synchronized void saveMemoryMap(JSONObject map, boolean mock) throws Exception {
        if (map == null) throw new IllegalArgumentException("无效的内存扫描数据");
        String key = map.optString("bodyVersion", "").toLowerCase();
        if (!key.matches("^0x[0-9a-f]{4}$")) {
            throw new IllegalArgumentException("内存地图缺少有效机身版本");
        }
        map.put("bodyVersion", key);
        File file = memoryFile(mock);
        JSONObject maps;
        try {
            maps = readJson(file);
        } catch (Exception ignored) {
            maps = new JSONObject();
        }
        maps.put(key, map);
        writeJsonAtomic(file, maps);
    }
}
