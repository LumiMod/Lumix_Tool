// Confirmed triggers from DC-S5 v2.9 electronic-shutter testing (GitHub Issue #2).
// Keep unconfirmed slots open for user-defined local labels.
const CONFIRMED_ENTRIES = {
  0: { name: '定时拍照模式 2', note: '左上角波轮第 2 个定时模式', group: 'drive' },
  1: { name: 'AF 蜂鸣器音调 1', note: '半按快门合焦提示音（音调 1）', group: 'af' },
  2: { name: 'AF 蜂鸣器音调 2', note: '半按快门合焦提示音（音调 2）', group: 'af' },
  3: { name: 'AF 蜂鸣器音调 3', note: '半按快门合焦提示音（音调 3）', group: 'af' },
  8: { name: '开始视频录制', note: '开始录像提示音', group: 'video' },
  10: { name: '结束视频录制', note: '停止录像提示音', group: 'video' },
  11: { name: '连拍模式 2', note: '左上角波轮第 2 个连拍模式', group: 'drive' },
  20: { name: '电子快门音调 1', note: '电子快门音调 1 / 连拍模式 1', group: 'shutter' },
  21: { name: '电子快门音调 2', note: '电子快门音调 2', group: 'shutter' },
  22: { name: '电子快门音调 3', note: '电子快门音调 3', group: 'shutter' },
};

export const CONFIRMED_ORDER = [1, 2, 3, 20, 21, 22, 8, 10, 0, 11];

export const SOUND_PRESETS = [
  { id: 'af', label: 'AF 对焦音 1–3', indices: [1, 2, 3] },
  { id: 'shutter', label: '电子快门 1–3', indices: [20, 21, 22] },
  { id: 'video', label: '视频录制', indices: [8, 10] },
  { id: 'drive', label: '定时 / 连拍 2', indices: [0, 11] },
];

export const catalog = Array.from({ length: 28 }, (_, index) => {
  const known = CONFIRMED_ENTRIES[index];
  return {
    index,
    name: known?.name || `未命名 #${index}`,
    note: known?.note || '',
    group: known?.group || null,
    confirmed: Boolean(known),
  };
});

export const confirmedCatalog = CONFIRMED_ORDER.map(index => catalog[index]);

export const orderedCatalog = [
  ...confirmedCatalog,
  ...catalog.filter(entry => !entry.confirmed),
];

export function soundName(index, labels = {}) {
  return labels[index] || catalog[index]?.name || `未命名 #${index}`;
}
