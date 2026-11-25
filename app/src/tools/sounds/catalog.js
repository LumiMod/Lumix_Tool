// DC-S5 (MC801) v2.9 全部 28 项音效表（基于 program.bin 反汇编调用点与原厂波形核验）
const DEFINITIONS = [
  { index: 0,  name: '自拍倒计时滴答音',           en: 'Self-Timer Beep',            ja: 'セルフタイマー音',             note: '10 秒 / 2 秒自拍倒计时，最后 2 秒加速',           enNote: '10s / 2s countdown, speeds up in last 2s',        jaNote: '10秒/2秒カウントダウン（残り2秒で加速）',         common: true },
  { index: 1,  name: '对焦提示音（音调 1）',        en: 'AF Beep (Tone 1)',           ja: 'AF 合焦音（トーン 1）',        note: '半按快门合焦（默认音调，最常用）',                enNote: 'Half-shutter focus lock (default)',               jaNote: '半押し合焦音（標準・最頻出）',                   common: true },
  { index: 2,  name: '对焦提示音（音调 2）',        en: 'AF Beep (Tone 2)',           ja: 'AF 合焦音（トーン 2）',        note: '菜单切换电子音音调 2 时生效',                    enNote: 'Active when Beep Tone 2 is selected',             jaNote: '電子音トーン 2 選択時に有効',                    common: true },
  { index: 3,  name: '对焦提示音（音调 3）',        en: 'AF Beep (Tone 3)',           ja: 'AF 合焦音（トーン 3）',        note: '菜单切换电子音音调 3 时生效',                    enNote: 'Active when Beep Tone 3 is selected',             jaNote: '電子音トーン 3 選択時に有効',                    common: true },
  { index: 4,  name: '操作 / 警告提示音',           en: 'Operation / Alert Beep',     ja: '操作・警告音',                 note: '4 脉冲提示音，受静音模式控制',                   enNote: '4-pulse alert, muted in Silent Mode',             jaNote: '4連ビープ（サイレントモード連動）',              common: false },
  { index: 5,  name: '拍摄状态长提示音',            en: 'Status Long Beep',           ja: '撮影ステータス長音',           note: '5 脉冲提示音（约 1.1 秒）',                      enNote: '5-pulse tone (~1.1s)',                            jaNote: '5連ビープ（約 1.1 秒）',                         common: false },
  { index: 6,  name: '影像录制多脉冲提示音',        en: 'Recording Multi-Beep',       ja: '録画マルチビープ',             note: '8 脉冲长提示音（约 1.7 秒）',                    enNote: '8-pulse tone (~1.7s)',                            jaNote: '8連ビープ（約 1.7 秒）',                         common: false },
  { index: 7,  name: '长警报 / 完成提示音',         en: 'Long Alert / Done Tone',     ja: '長警告・完了音',               note: '3 脉冲长提示音（约 2.3 秒）',                    enNote: '3-pulse long alert (~2.3s)',                      jaNote: '3連長音（約 2.3 秒）',                           common: false },
  { index: 8,  name: '短单滴提示音（开始/确认）',   en: 'Short Single Beep',          ja: '短単音（開始/確認）',          note: '与 #10 成对触发',                                enNote: 'Paired with #10',                                 jaNote: '#10 とペアで動作',                               common: false },
  { index: 9,  name: '长单滴提示音',                en: 'Long Single Beep',           ja: '長単音ビープ',                 note: '与 #8 同频同组，时长约 0.5 秒',                  enNote: 'Same pitch group as #8 (~0.5s)',                  jaNote: '#8 と同系統（約 0.5 秒）',                       common: false },
  { index: 10, name: '双滴提示音（结束/取消）',     en: 'Double Beep (End/Cancel)',   ja: '2連ビープ（終了/取消）',       note: '与 #8 成对触发',                                 enNote: 'Paired with #8',                                  jaNote: '#8 とペアで動作',                                common: false },
  { index: 11, name: '电子快门·连拍（音调 1）',     en: 'E-Shutter Burst (Tone 1)',   ja: '電子シャッター連写（トーン 1）', note: '电子快门连拍循环音（音调 1）',                 enNote: 'Electronic shutter burst loop (Tone 1)',          jaNote: '電子シャッター連写ループ音（トーン 1）',         common: true },
  { index: 12, name: '电子快门·连拍（音调 2）',     en: 'E-Shutter Burst (Tone 2)',   ja: '電子シャッター連写（トーン 2）', note: '电子快门连拍循环音（音调 2）',                 enNote: 'Electronic shutter burst loop (Tone 2)',          jaNote: '電子シャッター連写ループ音（トーン 2）',         common: true },
  { index: 13, name: '电子快门·连拍（音调 3）',     en: 'E-Shutter Burst (Tone 3)',   ja: '電子シャッター連写（トーン 3）', note: '电子快门连拍循环音（音调 3）',                 enNote: 'Electronic shutter burst loop (Tone 3)',          jaNote: '電子シャッター連写ループ音（トーン 3）',         common: true },
  { index: 14, name: '电子快门·慢门开启（音调 1）', en: 'E-Shutter Open (Tone 1)',    ja: '電子シャッター開（トーン 1）',   note: '长曝光 / B 门前帘开启音（音调 1）',            enNote: 'Long exposure / Bulb open (Tone 1)',              jaNote: '長秒・バルブ前幕開音（トーン 1）',               common: false },
  { index: 15, name: '电子快门·慢门开启（音调 2）', en: 'E-Shutter Open (Tone 2)',    ja: '電子シャッター開（トーン 2）',   note: '长曝光 / B 门前帘开启音（音调 2）',            enNote: 'Long exposure / Bulb open (Tone 2)',              jaNote: '長秒・バルブ前幕開音（トーン 2）',               common: false },
  { index: 16, name: '电子快门·慢门开启（音调 3）', en: 'E-Shutter Open (Tone 3)',    ja: '電子シャッター開（トーン 3）',   note: '长曝光 / B 门前帘开启音（音调 3）',            enNote: 'Long exposure / Bulb open (Tone 3)',              jaNote: '長秒・バルブ前幕開音（トーン 3）',               common: false },
  { index: 17, name: '电子快门·慢门闭合（音调 1）', en: 'E-Shutter Close (Tone 1)',   ja: '電子シャッター閉（トーン 1）',   note: '长曝光 / B 门后帘闭合音（音调 1）',            enNote: 'Long exposure / Bulb close (Tone 1)',             jaNote: '長秒・バルブ後幕閉音（トーン 1）',               common: false },
  { index: 18, name: '电子快门·慢门闭合（音调 2）', en: 'E-Shutter Close (Tone 2)',   ja: '電子シャッター閉（トーン 2）',   note: '长曝光 / B 门后帘闭合音（音调 2）',            enNote: 'Long exposure / Bulb close (Tone 2)',             jaNote: '長秒・バルブ後幕閉音（トーン 2）',               common: false },
  { index: 19, name: '电子快门·慢门闭合（音调 3）', en: 'E-Shutter Close (Tone 3)',   ja: '電子シャッター閉（トーン 3）',   note: '长曝光 / B 门后帘闭合音（音调 3）',            enNote: 'Long exposure / Bulb close (Tone 3)',             jaNote: '長秒・バルブ後幕閉音（トーン 3）',               common: false },
  { index: 20, name: '电子快门·单张（音调 1）',     en: 'E-Shutter Single (Tone 1)',  ja: '電子シャッター単写（トーン 1）', note: '常规电子快门音，需切至电子快门并开启音量',      enNote: 'Requires Electronic Shutter + shutter volume',    jaNote: '電子シャッター設定＋シャッター音量 ON で有効',   common: true },
  { index: 21, name: '电子快门·单张（音调 2）',     en: 'E-Shutter Single (Tone 2)',  ja: '電子シャッター単写（トーン 2）', note: '菜单选电子快门音调 2 时生效',                  enNote: 'Active when E-Shutter Tone 2 is selected',        jaNote: '電子シャッタートーン 2 選択時に有効',            common: true },
  { index: 22, name: '电子快门·单张（音调 3）',     en: 'E-Shutter Single (Tone 3)',  ja: '電子シャッター単写（トーン 3）', note: '菜单选电子快门音调 3 时生效',                  enNote: 'Active when E-Shutter Tone 3 is selected',        jaNote: '電子シャッタートーン 3 選択時に有効',            common: true },
  { index: 23, name: '极短滴答音（备用）',          en: 'Short Click (Reserved)',     ja: '極短クリック音（予備）',       note: '约 35 ms 极短脉冲，未见直接硬编码调用',          enNote: '~35ms click, no direct hardcoded caller',         jaNote: '約 35ms の短音（直接呼出なし）',                 common: false },
  { index: 24, name: '定时 / 长曝间歇滴声',         en: 'Interval / Bulb Beep',       ja: 'インターバル間欠音',           note: '拍摄期间定时循环提示音（与 #8 共用原厂音源）',    enNote: 'Periodic beep during capture (shares #8 PCM)',    jaNote: '撮影中の定期ビープ（#8 と音源共用）',            common: false },
  { index: 25, name: '备用提示音 #25',              en: 'Reserved Tone #25',          ja: '予備ビープ #25',               note: '约 0.2 秒，未见直接硬编码调用',                  enNote: '~0.2s tone, no direct hardcoded caller',          jaNote: '約 0.2 秒（直接呼出なし）',                      common: false },
  { index: 26, name: '备用长提示音 #26',            en: 'Reserved Long Tone #26',     ja: '予備長音 #26',                 note: '约 1.2 秒双声，未见直接硬编码调用',              enNote: '~1.2s dual tone, no direct hardcoded caller',     jaNote: '約 1.2 秒 2 連音（直接呼出なし）',               common: false },
  { index: 27, name: '持续循环警报音',              en: 'Continuous Loop Alert',      ja: '連続ループ警告音',             note: '循环播放直至状态解除',                           enNote: 'Loops continuously until cleared',                jaNote: '解除されるまで連続ループ再生',                   common: false },
];

export const catalog = DEFINITIONS;

export const COMMON_PRESETS = [
  {
    id: 'focus-1', indices: [1],
    label: '对焦提示音', shortLabel: '对焦音 #1', note: '半按快门合焦（默认音调 1）',
    en: { label: 'AF Focus Beep', shortLabel: 'AF #1', note: 'Half-shutter focus lock (Tone 1)' },
    ja: { label: 'AF 合焦音', shortLabel: 'AF音 #1', note: '半押し合焦音（標準トーン 1）' },
  },
  {
    id: 'eshutter-1', indices: [20],
    label: '电子快门·单张', shortLabel: '电子快门 #20', note: '电子快门音调 1，需开启电子快门',
    en: { label: 'E-Shutter Single', shortLabel: 'E-Shutter #20', note: 'E-Shutter Tone 1 (enable E-Shutter)' },
    ja: { label: '電子シャッター単写', shortLabel: '電子シャッター #20', note: '電子シャッター音（トーン 1）' },
  },
  {
    id: 'eshutter-all', indices: [20, 21, 22],
    label: '电子快门·单张全3档', shortLabel: '电子快门 #20–22', note: '覆盖音调 1/2/3，切换音调也生效',
    en: { label: 'E-Shutter All 3 Tones', shortLabel: 'E-Shutter #20–22', note: 'Covers Tones 1 / 2 / 3' },
    ja: { label: '電子シャッター全 3 音色', shortLabel: '電子シャッター #20–22', note: 'トーン 1/2/3 すべてに反映' },
  },
  {
    id: 'burst-all', indices: [11, 12, 13],
    label: '电子快门·连拍全3档', shortLabel: '连拍音 #11–13', note: '电子快门连拍循环音（音调 1/2/3）',
    en: { label: 'E-Shutter Burst (All 3)', shortLabel: 'Burst #11–13', note: 'Burst loop sound (Tones 1/2/3)' },
    ja: { label: '電子シャッター連写全 3 音色', shortLabel: '連写音 #11–13', note: '連写ループ音（トーン 1/2/3）' },
  },
  {
    id: 'timer-0', indices: [0],
    label: '自拍倒计时', shortLabel: '自拍倒计时 #0', note: '10 秒 / 2 秒自拍滴答声',
    en: { label: 'Self-Timer Beep', shortLabel: 'Self-Timer #0', note: '10s / 2s countdown beep' },
    ja: { label: 'セルフタイマー音', shortLabel: 'タイマー #0', note: '10秒 / 2秒カウントダウン音' },
  },
];

// 常用项排在前面，便于直接定位
const PRIORITY_ORDER = [
  1, 20, 21, 22, 11, 12, 13, 0, 2, 3,
  14, 15, 16, 17, 18, 19, 24, 8, 10, 9, 4, 5, 6, 7, 27, 23, 25, 26,
];

export const orderedCatalog = PRIORITY_ORDER.map(i => catalog[i]);

export function soundName(index, labels = {}, lang = 'zh') {
  if (labels[index]) return labels[index];
  const item = catalog[index];
  if (!item) return `#${index}`;
  if (lang === 'en') return item.en || item.name;
  if (lang === 'ja') return item.ja || item.name;
  return item.name;
}

export function soundNote(index, lang = 'zh') {
  const item = catalog[index];
  if (!item) return '';
  if (lang === 'en') return item.enNote || item.note;
  if (lang === 'ja') return item.jaNote || item.note;
  return item.note;
}

export function localizePreset(preset, lang = 'zh') {
  if (lang === 'en' && preset.en) return { ...preset, ...preset.en };
  if (lang === 'ja' && preset.ja) return { ...preset, ...preset.ja };
  return preset;
}
