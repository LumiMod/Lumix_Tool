// DC-S5 (MC801) v2.9 全部 28 项音效表（基于 program.bin 反汇编调用点与原厂波形核验）
const DEFINITIONS = [
  { index: 0,  name: '自拍倒计时滴答音',       note: '10 秒 / 2 秒自拍倒计时，最后 2 秒加速',           common: true },
  { index: 1,  name: '对焦提示音（音调 1）',    note: '半按快门合焦（默认音调，最常用）',                common: true },
  { index: 2,  name: '对焦提示音（音调 2）',    note: '菜单切换电子音音调 2 时生效',                    common: true },
  { index: 3,  name: '对焦提示音（音调 3）',    note: '菜单切换电子音音调 3 时生效',                    common: true },
  { index: 4,  name: '操作 / 警告提示音',       note: '4 脉冲提示音，受静音模式控制',                   common: false },
  { index: 5,  name: '拍摄状态长提示音',        note: '5 脉冲提示音（约 1.1 秒）',                      common: false },
  { index: 6,  name: '影像录制多脉冲提示音',    note: '8 脉冲长提示音（约 1.7 秒）',                    common: false },
  { index: 7,  name: '长警报 / 完成提示音',     note: '3 脉冲长提示音（约 2.3 秒）',                    common: false },
  { index: 8,  name: '短单滴提示音（开始/确认）', note: '与 #10 成对触发',                              common: false },
  { index: 9,  name: '长单滴提示音',            note: '与 #8 同频同组，时长约 0.5 秒',                  common: false },
  { index: 10, name: '双滴提示音（结束/取消）',  note: '与 #8 成对触发',                                common: false },
  { index: 11, name: '电子快门·连拍（音调 1）', note: '电子快门连拍循环音（音调 1）',                   common: true },
  { index: 12, name: '电子快门·连拍（音调 2）', note: '电子快门连拍循环音（音调 2）',                   common: true },
  { index: 13, name: '电子快门·连拍（音调 3）', note: '电子快门连拍循环音（音调 3）',                   common: true },
  { index: 14, name: '电子快门·慢门开启（音调 1）', note: '长曝光 / B 门前帘开启音（音调 1）',          common: false },
  { index: 15, name: '电子快门·慢门开启（音调 2）', note: '长曝光 / B 门前帘开启音（音调 2）',          common: false },
  { index: 16, name: '电子快门·慢门开启（音调 3）', note: '长曝光 / B 门前帘开启音（音调 3）',          common: false },
  { index: 17, name: '电子快门·慢门闭合（音调 1）', note: '长曝光 / B 门后帘闭合音（音调 1）',          common: false },
  { index: 18, name: '电子快门·慢门闭合（音调 2）', note: '长曝光 / B 门后帘闭合音（音调 2）',          common: false },
  { index: 19, name: '电子快门·慢门闭合（音调 3）', note: '长曝光 / B 门后帘闭合音（音调 3）',          common: false },
  { index: 20, name: '电子快门·单张（音调 1）', note: '常规电子快门音，需切至电子快门并开启音量',        common: true },
  { index: 21, name: '电子快门·单张（音调 2）', note: '菜单选电子快门音调 2 时生效',                    common: true },
  { index: 22, name: '电子快门·单张（音调 3）', note: '菜单选电子快门音调 3 时生效',                    common: true },
  { index: 23, name: '极短滴答音（备用）',      note: '约 35 ms 极短脉冲，未见直接硬编码调用',          common: false },
  { index: 24, name: '定时 / 长曝间歇滴声',     note: '拍摄期间定时循环提示音（与 #8 共用原厂音源）',    common: false },
  { index: 25, name: '备用提示音 #25',          note: '约 0.2 秒，未见直接硬编码调用',                  common: false },
  { index: 26, name: '备用长提示音 #26',        note: '约 1.2 秒双声，未见直接硬编码调用',              common: false },
  { index: 27, name: '持续循环警报音',          note: '循环播放直至状态解除',                           common: false },
];

export const catalog = DEFINITIONS;

export const COMMON_PRESETS = [
  { id: 'focus-1',     label: '对焦提示音',         shortLabel: '对焦音 #1',       indices: [1],          note: '半按快门合焦（默认音调 1）' },
  { id: 'eshutter-1',  label: '电子快门·单张',      shortLabel: '电子快门 #20',    indices: [20],         note: '电子快门音调 1，需开启电子快门' },
  { id: 'eshutter-all', label: '电子快门·单张全3档', shortLabel: '电子快门 #20–22', indices: [20, 21, 22], note: '覆盖音调 1/2/3，切换音调也生效' },
  { id: 'burst-all',   label: '电子快门·连拍全3档',  shortLabel: '连拍音 #11–13',   indices: [11, 12, 13], note: '电子快门连拍循环音（音调 1/2/3）' },
  { id: 'timer-0',     label: '自拍倒计时',         shortLabel: '自拍倒计时 #0',   indices: [0],          note: '10 秒 / 2 秒自拍滴答声' },
];

// 常用项排在前面，便于直接定位
const PRIORITY_ORDER = [
  1, 20, 21, 22, 11, 12, 13, 0, 2, 3,
  14, 15, 16, 17, 18, 19, 24, 8, 10, 9, 4, 5, 6, 7, 27, 23, 25, 26,
];

export const orderedCatalog = PRIORITY_ORDER.map(i => catalog[i]);

export function soundName(index, labels = {}) {
  return labels[index] || catalog[index]?.name || `未命名 #${index}`;
}
