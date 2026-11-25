import { useAudioPreview } from './hooks/useAudioPreview';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ConfigProvider, theme } from 'antd';
import {
  ArrowLeftOutlined, CheckCircleFilled, CloudUploadOutlined, DownloadOutlined,
  EditOutlined, ExpandOutlined, FolderOpenOutlined, PauseOutlined,
  PlayCircleOutlined, ReloadOutlined, RightOutlined, ScanOutlined,
  SoundOutlined, StarOutlined, UndoOutlined, UsbOutlined, WarningOutlined,
} from '@ant-design/icons';
import OpenGate from './tools/OpenGate';
import { decodeAudio, MAX_SECONDS } from './tools/focus-sound/audio.mjs';
import Waveform from './tools/focus-sound/Waveform';
import { catalog, COMMON_PRESETS, orderedCatalog, soundName } from './tools/sounds/catalog';
import { slotState } from './tools/sounds/state.mjs';
import { BLOCK, liveRegions, memoryStats, planAllocation } from '../memory.mjs';
import { applySoundBatch, GITHUB_REPO_URL, invokeNative, openExternal, restoreSoundBatch } from './mobileApi';
import MobileButtonGuide from './MobileButtonGuide';
import './mobile.css';

const writeLabel = '正在写入相机…';
const keepAwakeHint = '实机写入可能需要较长时间。请保持 USB 连接，偶尔轻触相机屏幕，避免机身休眠。';
const restartHint = '请用相机电源开关关机再开机，使音效生效。重启时请保留电池。';
const pages = {
  camera: '连接相机',
  formats: '片门全开解锁',
  audio: '相机音效替换',
};

export default function MobileApp() {
  const [page, setPage] = useState(() => (typeof history !== 'undefined' ? history.state?.tool : null) || null);
  useEffect(() => {
    const restorePage = () => setPage(history.state?.tool || null);
    window.addEventListener('popstate', restorePage);
    return () => window.removeEventListener('popstate', restorePage);
  }, []);

  const previousTool = useRef(null);
  const heading = useRef(null);
  const pageRef = useRef(page);
  pageRef.current = page;

  const goHome = useCallback(() => {
    setPage(null);
    try { history.replaceState(null, '', window.location.pathname); } catch {}
  }, []);

  useEffect(() => {
    window.__lumixBack = () => {
      if (pageRef.current) {
        goHome();
        return true;
      }
      return false;
    };
    return () => { delete window.__lumixBack; };
  }, [goHome]);

  function openTool(tool) {
    previousTool.current = tool;
    try { history.pushState({ tool }, '', '#' + tool); } catch {}
    setPage(tool);
  }

  const [device, setDevice] = useState({ connected: false, mode: 'none', mock: false });
  const [checking, setChecking] = useState(false);
  const [busyLabel, setBusyLabel] = useState('');
  const [progress, setProgress] = useState(null);
  const busyRef = useRef(false);

  // Audio page state
  const [slotTab, setSlotTab] = useState('common'); // 'common' | 'all'
  const [presetId, setPresetId] = useState(COMMON_PRESETS[0].id);
  const [selected, setSelected] = useState([1]);
  const [audio, setAudio] = useState(null);
  const [audioError, setAudioError] = useState('');
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [burnResult, setBurnResult] = useState(null);
  const [editingSlot, setEditingSlot] = useState(null);
  const [editingText, setEditingText] = useState('');
  const [confirmRestoreTarget, setConfirmRestoreTarget] = useState(undefined);
  const [showAdvancedMem, setShowAdvancedMem] = useState(false);
  const [linkError, setLinkError] = useState('');

  const { playing, stopPreview, preview } = useAudioPreview();

  const refreshDevice = useCallback(async (requestPermission = false) => {
    if (busyRef.current) return null;
    setChecking(true);
    try {
      const res = await invokeNative('status', { requestPermission });
      if (res && !res.busy) setDevice(res);
      return res;
    } finally {
      setChecking(false);
    }
  }, []);

  const runExclusive = useCallback(async (label, task, refreshAfter = true) => {
    if (busyRef.current) return { ok: false, error: '操作进行中，请稍候' };
    busyRef.current = true;
    stopPreview();
    setBusyLabel(label);
    setProgress(null);
    try {
      return await task();
    } finally {
      busyRef.current = false;
      setBusyLabel('');
      setProgress(null);
      if (refreshAfter) {
        setChecking(true);
        try {
          const next = await invokeNative('status', { requestPermission: false });
          if (next && !next.busy) setDevice(next);
        } finally {
          setChecking(false);
        }
      }
    }
  }, [stopPreview]);

  useEffect(() => {
    void refreshDevice(false);
    const onProgress = event => {
      if (event.detail && Number.isFinite(event.detail.total) && event.detail.total > 0) {
        setProgress(event.detail);
      }
    };
    const onUsb = event => {
      if (!busyRef.current) void refreshDevice(event.detail?.reason === 'attached');
    };
    window.addEventListener('lumix-progress', onProgress);
    window.addEventListener('lumix-usb', onUsb);
    return () => {
      window.removeEventListener('lumix-progress', onProgress);
      window.removeEventListener('lumix-usb', onUsb);
    };
  }, [refreshDevice]);

  useEffect(() => {
    if (page !== 'audio') stopPreview();
    if (page) heading.current?.focus({ preventScroll: true });
    else if (previousTool.current) document.getElementById('tool-' + previousTool.current)?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [page, stopPreview]);

  const isBusy = !!busyLabel || checking;
  const ready = !!device?.connected && !!device?.soundTable?.ok;
  const firmwareBlocked = !!device?.connected && device?.verified === false;
  const soundTable = device?.soundTable;
  const entries = soundTable?.entries || [];
  const originals = soundTable?.originals || {};
  const labels = soundTable?.labels || {};
  const memoryMap = device?.memoryMap || null;
  const live = liveRegions(entries);
  const stats = memoryStats(memoryMap, entries);
  const activePreset = COMMON_PRESETS.find(p => p.id === presetId) || COMMON_PRESETS[0];
  const activeIndices = slotTab === 'common' ? activePreset.indices : selected;
  const plan = audio && activeIndices.length ? planAllocation(memoryMap, entries, activeIndices, audio.samples) : null;

  useEffect(() => { setBurnResult(null); }, [slotTab, presetId, selected]);

  async function exitMock() {
    if (isBusy) return;
    await runExclusive('切换中…', async () => {
      await invokeNative('setMock', { enabled: false });
      setBurnResult(null);
      return { ok: true };
    });
  }

  async function selectFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';
    stopPreview();
    setAudio(null);
    setAudioError('');
    setBurnResult(null);
    setLoadingAudio(true);
    try {
      if (file.size > 100 * 1024 * 1024) throw new Error('请选择小于 100 MB 的音频');
      setAudio(await decodeAudio(await file.arrayBuffer(), file.name));
    } catch (err) {
      setAudioError(err.message || '无法解析该音频文件');
    } finally {
      setLoadingAudio(false);
    }
  }

  async function handleApplySounds() {
    if (isBusy || !ready || firmwareBlocked || !audio || !activeIndices.length) return;
    setBurnResult(null);
    setConfirmRestoreTarget(undefined);
    const response = await runExclusive(writeLabel, () => applySoundBatch({
      indices: activeIndices,
      pcm: audio.pcm,
      samples: audio.samples,
      version: soundTable.version,
      currentMap: memoryMap,
      entries,
    }));

    const succeeded = response?.succeeded || [];
    setBurnResult({
      ok: !!response?.ok,
      changed: !!response?.ok || succeeded.length > 0,
      rescan: !!response?.rescan || response?.error === 'region not free',
      title: response?.ok ? (device.mock ? '模拟写入完成' : '音效写入完成') : succeeded.length ? '部分音效已写入' : '写入未完成',
      text: response?.ok
        ? (device.mock ? '已更新模拟音效。' : restartHint)
        : response?.error === 'region not free'
          ? '空间记录已过期，请点击下方重新扫描后再试'
          : (response?.error || '写入未完成，请检查连接'),
    });
  }

  async function handleRestoreSounds(target) {
    if (isBusy || !ready || firmwareBlocked) return;
    setConfirmRestoreTarget(undefined);
    setBurnResult(null);
    const indices = target == null ? null : Array.isArray(target) ? target : [target];
    const response = await runExclusive('正在恢复原厂音效…', () => restoreSoundBatch({
      indices,
      version: soundTable.version,
    }));
    setBurnResult({
      ok: !!response?.ok,
      changed: !!response?.ok,
      title: response?.ok ? (device.mock ? '模拟恢复完成' : '已恢复原厂音效') : '恢复未完成',
      text: response?.ok ? (device.mock ? '已恢复模拟音效。' : restartHint) : (response?.error || '恢复失败'),
    });
  }

  async function handleScanMemory() {
    if (isBusy || !device?.connected) return;
    const res = await runExclusive('正在扫描相机内存…', () => invokeNative('scanMemory'));
    setBurnResult({
      ok: !!res?.ok,
      changed: false,
      text: res?.ok ? '内存扫描已更新' : (res?.error || '扫描失败'),
    });
  }

  async function saveSlotLabel(index) {
    if (!soundTable?.version) return;
    const res = await invokeNative('renameSound', {
      version: soundTable.version,
      index,
      label: editingText,
    });
    if (res?.ok) {
      setEditingSlot(null);
      await refreshDevice(false);
    }
  }

  function toggleSlotSelection(index) {
    setSelected(prev => (prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index].sort((a, b) => a - b)));
  }

  async function handleSupportAuthor() {
    setLinkError('');
    const res = await openExternal(GITHUB_REPO_URL);
    if (res && res.ok === false) {
      setLinkError(res.error || '无法打开浏览器，请手动访问 GitHub 仓库');
    }
  }

  const entryByIndex = new Map(entries.map(e => [e.index, e]));
  const allRows = orderedCatalog.map(item => ({ ...item, ...entryByIndex.get(item.index) }));

  const pct = progress && progress.total > 0
    ? Math.min(100, Math.max(0, Math.round((progress.done / progress.total) * 100)))
    : 0;

  const pillText = busyLabel
    ? '处理中'
    : checking
      ? '检测中'
      : device?.connected
        ? (device.mock ? '模拟已连接' : 'DC-S5 已连接')
        : device?.mode === 'ptp'
          ? '需进服务模式'
          : '未连接';

  return <ConfigProvider theme={{
    algorithm: theme.defaultAlgorithm,
    token: { colorPrimary: '#2563eb', colorFillAlter: '#f8fafc', borderRadius: 12 },
  }}>
    <main className="mobile-shell">
      <header className="mobile-bar">
        {page && <button className="back-key" aria-label="返回" onClick={goHome}><ArrowLeftOutlined /></button>}
        <div className="wordmark"><span className="brand-tile" aria-hidden="true"><i /></span>Lumix<span>Tool</span></div>
        <button
          type="button"
          id="headerDevicePill"
          className={'status-pill' + (device?.connected ? ' is-connected' : device?.mode === 'ptp' ? ' is-warn' : '')}
          disabled={isBusy || page === 'camera'}
          onClick={() => openTool('camera')}
        >
          <i aria-hidden="true" />
          <span>{pillText}</span>
        </button>
      </header>

      <div className="mobile-content" key={page || 'home'}>
        {page && <h1 className="mobile-title" ref={heading} tabIndex="-1">{pages[page]}</h1>}

        {device?.mock && <div className="mock-strip" role="status">
          <span>模拟体验模式（未连接真机）</span>
          <button type="button" disabled={isBusy} onClick={exitMock}>退出</button>
        </div>}

        {/* 首页 */}
        {!page && <nav aria-label="主菜单" className="home-grid">
          <button id="tool-camera" className="hero-card" onClick={() => openTool('camera')}>
            <div className="hero-card__copy">
              <span className={'hero-tag' + (device?.connected ? ' is-live' : '')}>
                {device?.connected ? '已就绪 · LUMIX DC-S5' : 'LUMIX DC-S5'}
              </span>
              <strong>{device?.connected ? '相机已连接' : '连接相机'}</strong>
              <small>
                {device?.connected
                  ? `固件 2.9${device.unlock?.unlocked ? ' · 已解锁 6K' : ''}`
                  : '查看按键开机引导并连接'}
              </small>
            </div>
            <div className="hero-card__visual" aria-hidden="true" />
          </button>

          <div className="menu-card">
            <MenuEntry
              id="formats"
              icon={<ExpandOutlined />}
              title="片门全开解锁"
              subtitle="开启 6K / 5.9K 规格与不限时录制"
              badge={device?.unlock?.unlocked ? '已开启' : null}
              openTool={openTool}
            />
            <MenuEntry
              id="audio"
              icon={<SoundOutlined />}
              title="相机音效替换"
              subtitle="自定义对焦提示音与机身音效"
              badge={live.length ? `已改 ${live.length} 项` : null}
              openTool={openTool}
            />
          </div>

          <div className="menu-card">
            <button id="btnSupportAuthor" type="button" className="menu-item" onClick={handleSupportAuthor}>
              <span className="menu-icon is-star" aria-hidden="true"><StarOutlined /></span>
              <span className="menu-copy">
                <span className="menu-copy__top">
                  <strong>给作者赞赏</strong>
                  <em className="menu-badge is-star">点 Star</em>
                </span>
                <small>开源免费 · 前往 GitHub 点亮 Star 支持作者</small>
              </span>
              <RightOutlined className="menu-arrow" aria-hidden="true" />
            </button>
          </div>

          {linkError && <div role="alert" className="notice-bar is-error">
            <WarningOutlined />
            <span>{linkError}</span>
          </div>}
        </nav>}

        {/* 连接相机页 */}
        {page === 'camera' && <section className="stack">
          {!device?.connected && <MobileButtonGuide />}

          {device?.mode === 'ptp' && <div className="notice-bar is-warn">
            <WarningOutlined />
            <span>当前是普通照片传输模式，请先关机并按上方两个按键重新开机</span>
          </div>}

          {device?.connected && <div className="white-card">
            <div className="kv-list">
              <div><span>连接设备</span><strong>LUMIX DC-S5 {device.mock ? '（模拟）' : ''}</strong></div>
              <div><span>固件版本</span><strong>{device.verified ? '2.9（已支持）' : `${device.body_version}（不支持写入）`}</strong></div>
              <div><span>6K 解锁</span><strong>{device.unlock?.unlocked ? '已开启' : '未开启'}</strong></div>
              <div><span>自定义音效</span><strong>{live.length ? `已替换 ${live.length} 项` : '原厂默认'}</strong></div>
            </div>
            <div className="btn-row" style={{ marginTop: 14 }}>
              <button type="button" className="ghost-btn" onClick={() => openTool('formats')}>去解锁 6K</button>
              <button type="button" className="ghost-btn" onClick={() => openTool('audio')}>去换音效</button>
            </div>
          </div>}

          {device?.error && !device?.connected && device?.mode !== 'ptp' && <div className="notice-bar is-error">
            <WarningOutlined />
            <span>{device.error}</span>
          </div>}

          <button id="btnConnectCamera" className="primary-btn" disabled={isBusy} onClick={() => refreshDevice(true)}>
            {checking ? <ReloadOutlined spin /> : <UsbOutlined />}
            {checking ? '正在连接…' : device?.connected ? '刷新状态' : '连接相机'}
          </button>

        </section>}

        {/* 片门全开解锁页 */}
        {page === 'formats' && <OpenGate
          mobile
          deviceState={device}
          busy={isBusy}
          progress={progress}
          onOpenConnect={() => openTool('camera')}
          onSetUnlock={enable => runExclusive(
            enable ? '正在解锁…' : '正在恢复…',
            () => invokeNative('setUnlock', { unlock: enable }),
          )}
        />}

        {/* 相机音效替换页 */}
        {page === 'audio' && <section className="stack">
          {firmwareBlocked && <div role="alert" className="notice-bar is-warn">
            <WarningOutlined />
            <span>仅支持官方 2.9 固件写入音效</span>
          </div>}

          {/* 1. 选择声音 */}
          <div className="white-card">
            <div className="card-head">
              <strong>1. 选择音频</strong>
              {audio && <span className="muted-tag">
                {audio.duration.toFixed(2)} 秒{audio.originalDuration > MAX_SECONDS ? '（已截取前 3 秒）' : ''}
              </span>}
            </div>

            {audio ? (
              <div className="wave-wrap">
                <Waveform active buffer={audio.buffer} />
              </div>
            ) : (
              <div className="wave-placeholder">支持 MP3 / WAV / M4A，最长取前 3 秒</div>
            )}

            <div className="btn-row" style={{ marginTop: 12 }}>
              <label className={'file-btn ' + (audio ? 'ghost-btn' : 'primary-btn')}>
                <FolderOpenOutlined />{loadingAudio ? '解析中…' : audio ? '重选音频' : '选择音频文件'}
                <input aria-label="选择音频文件" type="file" accept="audio/*" disabled={loadingAudio || isBusy} onChange={selectFile} />
              </label>
              {audio && <button id="btnPreviewAudio" type="button" className="ghost-btn" disabled={isBusy} onClick={() => preview(audio.buffer, setAudioError)}>
                {playing ? <PauseOutlined /> : <PlayCircleOutlined />}{playing ? '停止' : '试听'}
              </button>}
            </div>
            {audioError && <p className="inline-err">{audioError}</p>}
          </div>

          {/* 2. 选择替换位置 */}
          <div className="white-card">
            <div className="card-head">
              <strong>2. 替换位置</strong>
              <div className="seg-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  disabled={isBusy}
                  aria-selected={slotTab === 'common'}
                  className={slotTab === 'common' ? 'is-active' : ''}
                  onClick={() => setSlotTab('common')}
                >
                  常用音效
                </button>
                <button
                  type="button"
                  role="tab"
                  disabled={isBusy}
                  aria-selected={slotTab === 'all'}
                  className={slotTab === 'all' ? 'is-active' : ''}
                  onClick={() => setSlotTab('all')}
                >
                  全部 28 项
                </button>
              </div>
            </div>

            {slotTab === 'common' ? (
              <div className="preset-list" role="radiogroup" aria-label="常用音效">
                {COMMON_PRESETS.map(preset => {
                  const isActive = preset.id === activePreset.id;
                  const states = preset.indices.map(i => slotState({ ...catalog[i], ...entryByIndex.get(i) }, originals[i]));
                  const replacedIndices = preset.indices.filter((i, idx) => states[idx] === '已替换' && originals[i]);
                  const stateLabel = states.every(s => s === '已替换')
                    ? '已替换'
                    : states.some(s => s === '已替换')
                      ? '部分已替换'
                      : states.every(s => s === '原厂')
                        ? '原厂'
                        : '未读取';
                  return <div
                    key={preset.id}
                    className={'preset-card' + (isActive ? ' is-active' : '')}
                    role="radio"
                    aria-checked={isActive}
                    tabIndex={isBusy ? -1 : 0}
                    onClick={() => { if (!isBusy) setPresetId(preset.id); }}
                    onKeyDown={e => { if (!isBusy && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setPresetId(preset.id); } }}
                  >
                    <span className="preset-radio" aria-hidden="true" />
                    <div className="preset-copy">
                      <div className="preset-copy__top">
                        <strong>{preset.label}</strong>
                        <span className="preset-nums">
                          {preset.indices.length === 1 ? `#${preset.indices[0]}` : `#${preset.indices[0]}–${preset.indices[preset.indices.length - 1]}`}
                        </span>
                        {stateLabel.includes('已替换') && <em className="mini-tag">{stateLabel}</em>}
                      </div>
                      <small>{preset.note}</small>
                    </div>
                    {ready && replacedIndices.length > 0 && (
                      <button
                        type="button"
                        className="ghost-btn is-compact"
                        disabled={isBusy || firmwareBlocked}
                        onClick={e => { e.stopPropagation(); setConfirmRestoreTarget(replacedIndices); }}
                      >
                        <UndoOutlined />恢复
                      </button>
                    )}
                  </div>;
                })}
              </div>
            ) : (
              <>
                <div className="quick-pills">
                  <button type="button" disabled={isBusy} onClick={() => setSelected([1, 2, 3])}>对焦 #1–3</button>
                  <button type="button" disabled={isBusy} onClick={() => setSelected([20, 21, 22])}>电子快门 #20–22</button>
                  <button type="button" disabled={isBusy} onClick={() => setSelected([11, 12, 13])}>连拍 #11–13</button>
                  <button type="button" disabled={isBusy} onClick={() => setSelected(Array.from({ length: 28 }, (_, i) => i))}>全选</button>
                  <button type="button" disabled={isBusy} onClick={() => setSelected([])}>清空</button>
                  {ready && Object.keys(originals).length > 0 && (
                    <button type="button" className="is-restore" onClick={() => setConfirmRestoreTarget(null)}>恢复全部</button>
                  )}
                </div>

                <div className="compact-slots">
                  {allRows.map(row => {
                    const checked = selected.includes(row.index);
                    const st = slotState(row, originals[row.index]);
                    const isEdit = editingSlot === row.index;
                    return <div key={row.index} data-slot={row.index} className={'compact-slot' + (checked ? ' is-checked' : '')}>
                      <label className="compact-slot__row">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={isBusy}
                          onChange={() => toggleSlotSelection(row.index)}
                        />
                        <span className="slot-num">#{row.index}</span>
                        <span className="slot-copy">
                          <span className="slot-copy__top">
                            <span className="slot-label">{soundName(row.index, labels)}</span>
                            {st === '已替换' && <em className="mini-tag">已改</em>}
                          </span>
                          {row.note && <small className="slot-note">{row.note}</small>}
                        </span>
                      </label>
                      <div className="compact-slot__btns">
                        {ready && <button
                          type="button"
                          aria-label={`备注 #${row.index}`}
                          onClick={() => { setEditingSlot(isEdit ? null : row.index); setEditingText(labels[row.index] || ''); }}
                        >
                          <EditOutlined />
                        </button>}
                        {ready && originals[row.index] && st === '已替换' && (
                          <button type="button" onClick={() => setConfirmRestoreTarget(row.index)}>恢复</button>
                        )}
                      </div>
                      {isEdit && <div className="rename-inline">
                        <input
                          type="text"
                          maxLength={80}
                          value={editingText}
                          placeholder="输入备注名称"
                          onChange={e => setEditingText(e.target.value)}
                        />
                        <button type="button" onClick={() => saveSlotLabel(row.index)}>保存</button>
                      </div>}
                    </div>;
                  })}
                </div>
              </>
            )}

            {confirmRestoreTarget !== undefined && <div className="confirm-bar">
              <span>{confirmRestoreTarget === null
                ? '确认恢复全部音效为原厂默认？'
                : Array.isArray(confirmRestoreTarget)
                  ? `确认恢复 ${confirmRestoreTarget.map(i => `#${i}`).join('、')} 原厂音效？`
                  : `确认恢复 #${confirmRestoreTarget} 原厂音效？`}</span>
              <div>
                <button type="button" className="primary-btn is-compact" disabled={isBusy} onClick={() => handleRestoreSounds(confirmRestoreTarget)}>确认</button>
                <button type="button" className="ghost-btn is-compact" disabled={isBusy} onClick={() => setConfirmRestoreTarget(undefined)}>取消</button>
              </div>
            </div>}
          </div>

          {/* 进度提示 */}
          {busyLabel && <div className="progress-card" role="status">
            <div className="progress-card__head">
              <span>{progress?.phase === 'scan' ? '首次准备相机空间…' : busyLabel}</span>
              <span>{pct}%</span>
            </div>
            <div className="progress-track"><div style={{ width: `${pct}%` }} /></div>
            {busyLabel === writeLabel && <p className="progress-awake-tip">{keepAwakeHint}</p>}
          </div>}

          {/* 写入前防休眠提示 */}
          {!busyLabel && ready && !firmwareBlocked && audio && activeIndices.length > 0
            && !(burnResult?.ok && burnResult.changed) && (!plan || plan.ok || plan.needsScan) &&
            <div className="notice-bar is-warn">
              <WarningOutlined /><span>{keepAwakeHint}</span>
            </div>}

          {/* 结果反馈 */}
          {burnResult && <div role="status" className={'notice-bar ' + (burnResult.ok ? 'is-ok' : 'is-error')}>
            {burnResult.ok ? <CheckCircleFilled /> : <WarningOutlined />}
            <div className="notice-copy">
              {burnResult.title && <strong>{burnResult.title}</strong>}
              <span>{burnResult.text}</span>
            </div>
            {burnResult.rescan && <button type="button" className="ghost-btn is-compact" disabled={isBusy} onClick={handleScanMemory}>重新扫描</button>}
          </div>}

          {plan && !plan.ok && !plan.needsScan && <div role="alert" className="notice-bar is-error">
            <WarningOutlined />
            <span>相机可用空间不足，请缩短音频或减少勾选数量</span>
          </div>}

          {/* 主操作按钮 */}
          {!ready ? (
            <button type="button" className="primary-btn" disabled={isBusy} onClick={() => openTool('camera')}>
              <UsbOutlined />先连接相机
            </button>
          ) : (
            <button
              id="btnApplyAudio"
              type="button"
              className="primary-btn"
              disabled={isBusy || firmwareBlocked || !audio || !activeIndices.length || (plan && !plan.ok && !plan.needsScan)}
              onClick={handleApplySounds}
            >
              <CloudUploadOutlined />
              {!audio
                ? '请先选择音频'
                : slotTab === 'common'
                  ? `写入${activePreset.label}`
                  : `写入所选音效（${activeIndices.length} 项）`}
            </button>
          )}

          {/* 低频高级诊断折叠入口 */}
          {ready && <div className="quiet-footer">
            <button type="button" className="text-link" onClick={() => setShowAdvancedMem(v => !v)}>
              {showAdvancedMem ? '收起存储信息' : '高级：相机内存空间'}
            </button>
            {showAdvancedMem && <div className="white-card adv-box">
              <div className="kv-list">
                <div><span>可用空间</span><strong>{memoryMap ? `${Math.floor(stats.totalFree / BLOCK).toLocaleString()} KiB` : '未扫描'}</strong></div>
                <div><span>已用空间</span><strong>{`${Math.floor(stats.used / BLOCK).toLocaleString()} KiB`}</strong></div>
              </div>
              <div className="btn-row" style={{ marginTop: 10 }}>
                <button id="btnScanMemory" type="button" className="ghost-btn is-compact" disabled={isBusy} onClick={handleScanMemory}>
                  <ScanOutlined />重新扫描
                </button>
                <button
                  id="btnExportMemory"
                  type="button"
                  className="ghost-btn is-compact"
                  disabled={isBusy || !memoryMap}
                  onClick={() => invokeNative('exportMemory', { version: memoryMap.bodyVersion })}
                >
                  <DownloadOutlined />导出诊断
                </button>
              </div>
            </div>}
          </div>}
        </section>}
      </div>
    </main>
  </ConfigProvider>;
}

function MenuEntry({ id, icon, title, subtitle, badge, openTool }) {
  return <button id={'tool-' + id} className="menu-item" onClick={() => openTool(id)}>
    <span className="menu-icon" aria-hidden="true">{icon}</span>
    <span className="menu-copy">
      <span className="menu-copy__top">
        <strong>{title}</strong>
        {badge && <em className="menu-badge">{badge}</em>}
      </span>
      <small>{subtitle}</small>
    </span>
    <RightOutlined className="menu-arrow" aria-hidden="true" />
  </button>;
}
