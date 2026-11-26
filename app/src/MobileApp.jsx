import { useAudioPreview } from './hooks/useAudioPreview';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ConfigProvider, theme } from 'antd';
import {
  ArrowLeftOutlined, BgColorsOutlined, CheckCircleFilled, CloudSyncOutlined, CloudUploadOutlined,
  DownloadOutlined, EditOutlined, ExpandOutlined, FolderOpenOutlined,
  GithubOutlined, GlobalOutlined, PauseOutlined, PlayCircleOutlined,
  ReloadOutlined, RightOutlined, ScanOutlined, SettingOutlined,
  SoundOutlined, StarOutlined, UndoOutlined, UsbOutlined, WarningOutlined,
} from '@ant-design/icons';
import OpenGate from './tools/OpenGate';
import LutDirect from './tools/lut/LutDirect';
import { decodeAudio, MAX_SECONDS } from './tools/focus-sound/audio.mjs';
import Waveform from './tools/focus-sound/Waveform';
import { catalog, COMMON_PRESETS, localizePreset, orderedCatalog, soundName, soundNote } from './tools/sounds/catalog';
import { slotState } from './tools/sounds/state.mjs';
import { BLOCK, liveRegions, memoryStats, planAllocation } from '../memory.mjs';
import { applySoundBatch, GITHUB_REPO_URL, invokeNative, openExternal, restoreSoundBatch } from './mobileApi';
import MobileButtonGuide from './MobileButtonGuide';
import LanguagePicker from './components/LanguagePicker';
import { I18nProvider, LANGUAGES, useI18n } from './i18n';
import './mobile.css';

export default function MobileApp({ initialLang = null } = {}) {
  return <I18nProvider initialLang={initialLang}>
    <MobileAppShell />
    <LanguagePicker />
  </I18nProvider>;
}

function MobileAppShell() {
  const { lang, setLang, t } = useI18n();
  const appVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.4.2';
  const writeLabel = t('status.busy');
  const keepAwakeHint = t('mobile.audio.keepAwake');
  const restartHint = t('mobile.audio.restartHint');
  const [lutView, setLutView] = useState(() => globalThis.history?.state?.lutView?.page || 'home');
  const pages = {
    camera: t('nav.connection'),
    lut: t(lutView === 'guide' ? 'lut.guideTitle' : lutView === 'transfer' ? 'lut.transferTitle' : 'mobile.home.lutTitle'),
    formats: t('mobile.home.formatsTitle'),
    audio: t('mobile.home.audioTitle'),
    settings: t('settings.title'),
  };

  const [page, setPage] = useState(() => (typeof history !== 'undefined' ? history.state?.tool : null) || null);
  const [lutSession, setLutSession] = useState(page === 'lut' ? 1 : 0);
  const [lutPending, setLutPending] = useState(false);
  const lutBack = useRef(null);
  const returnFocus = useRef(null);
  useEffect(() => {
    const restorePage = () => {
      returnFocus.current = history.state?.returnFocus || null;
      setPage(history.state?.tool || null);
    };
    window.addEventListener('popstate', restorePage);
    return () => window.removeEventListener('popstate', restorePage);
  }, []);

  const heading = useRef(null);
  const pageRef = useRef(page);
  pageRef.current = page;

  const goBack = useCallback(() => {
    if (pageRef.current === 'lut' && lutBack.current?.()) return;
    if (history.state?.appEntry) { history.back(); return; }
    setPage(null);
    try { history.replaceState(null, '', window.location.pathname); } catch {}
  }, []);

  useEffect(() => {
    window.__lumixBack = () => {
      if (pageRef.current) {
        goBack();
        return true;
      }
      return false;
    };
    return () => { delete window.__lumixBack; };
  }, [goBack]);

  function openTool(tool) {
    if (page === tool) return;
    returnFocus.current = null;
    if (tool === 'lut') setLutSession(current => current + 1);
    try {
      history.replaceState({ ...history.state, returnFocus: document.activeElement?.id || (!page && 'tool-' + tool) }, '');
      history.pushState({ tool, appEntry: true }, '', '#' + tool);
    } catch {}
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
    if (busyRef.current) return { ok: false, error: t('status.busy') };
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
  }, [stopPreview, t]);

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
    const target = returnFocus.current && document.getElementById(returnFocus.current);
    returnFocus.current = null;
    window.scrollTo(0, 0);
    // Restore the originating control after the destination has restored its own view.
    if (target) {
      const frame = requestAnimationFrame(() => target.focus({ preventScroll: true }));
      return () => cancelAnimationFrame(frame);
    }
    heading.current?.focus({ preventScroll: true });
  }, [page, stopPreview]);

  const isBusy = !!busyLabel || checking || (page === 'lut' && lutPending);
  const ready = !!device?.connected && !!device?.soundTable?.ok;
  const firmwareBlocked = !!device?.connected && device?.verified === false;
  const soundTable = device?.soundTable;
  const entries = soundTable?.entries || [];
  const originals = soundTable?.originals || {};
  const labels = soundTable?.labels || {};
  const memoryMap = device?.memoryMap || null;
  const live = liveRegions(entries);
  const stats = memoryStats(memoryMap, entries);
  const activePresetRaw = COMMON_PRESETS.find(p => p.id === presetId) || COMMON_PRESETS[0];
  const activePreset = localizePreset(activePresetRaw, lang);
  const activeIndices = slotTab === 'common' ? activePreset.indices : selected;
  const plan = audio && activeIndices.length ? planAllocation(memoryMap, entries, activeIndices, audio.samples) : null;

  useEffect(() => { setBurnResult(null); }, [slotTab, presetId, selected]);

  async function exitMock() {
    if (isBusy) return;
    await runExclusive(t('status.busy'), async () => {
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
      if (file.size > 100 * 1024 * 1024) throw new Error('File > 100 MB');
      setAudio(await decodeAudio(await file.arrayBuffer(), file.name));
    } catch (err) {
      setAudioError(err.message || 'Unable to decode audio');
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
      title: response?.ok ? (device.mock ? 'Mock OK' : 'OK') : succeeded.length ? 'Partial' : 'Failed',
      text: response?.ok
        ? (device.mock ? 'Mock updated.' : restartHint)
        : (response?.error || 'Write failed'),
    });
  }

  async function handleRestoreSounds(target) {
    if (isBusy || !ready || firmwareBlocked) return;
    setConfirmRestoreTarget(undefined);
    setBurnResult(null);
    const indices = target == null ? null : Array.isArray(target) ? target : [target];
    const response = await runExclusive(t('status.busy'), () => restoreSoundBatch({
      indices,
      version: soundTable.version,
    }));
    setBurnResult({
      ok: !!response?.ok,
      changed: !!response?.ok,
      title: response?.ok ? t('mobile.audio.restore') : 'Failed',
      text: response?.ok ? (device.mock ? 'Mock restored.' : restartHint) : (response?.error || 'Restore failed'),
    });
  }

  async function handleScanMemory() {
    if (isBusy || !device?.connected) return;
    const res = await runExclusive(t('status.busy'), () => invokeNative('scanMemory'));
    setBurnResult({
      ok: !!res?.ok,
      changed: false,
      text: res?.ok ? 'OK' : (res?.error || 'Scan failed'),
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
      setLinkError(res.error || t('support.error'));
    }
  }

  const entryByIndex = new Map(entries.map(e => [e.index, e]));
  const allRows = orderedCatalog.map(item => ({ ...item, ...entryByIndex.get(item.index) }));

  const cameraConnected = !!device?.connected && !device.error;
  let cameraHint = t('mobile.home.cameraSub');
  if (checking) cameraHint = t('status.checking');
  else if (cameraConnected && device.verified) cameraHint = t('mobile.home.fwLabel') + (device.unlock?.unlocked ? t('mobile.home.unlocked6k') : '');
  else if (cameraConnected && device.body_version) cameraHint = t('mobile.camera.fwBad', { ver: device.body_version });
  else if (cameraConnected) cameraHint = t('nav.connection');
  else if (device?.mode === 'ptp') cameraHint = t('status.needService');
  else if (device?.error) cameraHint = t('status.error');

  const pct = progress && progress.total > 0
    ? Math.min(100, Math.max(0, Math.round((progress.done / progress.total) * 100)))
    : 0;

  const pillText = busyLabel
    ? t('status.busy')
    : checking
      ? t('status.checking')
      : device?.connected
        ? (device.mock ? t('status.connectedMock') : t('status.connectedS5'))
        : device?.mode === 'ptp'
          ? t('status.needService')
          : t('status.disconnected');

  return <ConfigProvider theme={{
    algorithm: theme.defaultAlgorithm,
    token: { colorPrimary: '#2563eb', colorFillAlter: '#f8fafc', borderRadius: 12 },
  }}>
    <main className="mobile-shell">
      <header className="mobile-bar">
        {page && <button className="back-key" aria-label={t('nav.back')} disabled={page === 'lut' && lutPending} onClick={goBack}><ArrowLeftOutlined /></button>}
        <div className="wordmark"><span className="brand-tile" aria-hidden="true"><i /></span>Lumix<span>Tool</span></div>
        <div className="mobile-bar__right">
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
          <button
            type="button"
            id="headerSettingsBtn"
            className={'icon-pill' + (page === 'settings' ? ' is-active' : '')}
            aria-label={t('nav.settings')}
            disabled={isBusy}
            onClick={() => openTool('settings')}
          >
            <SettingOutlined />
          </button>
        </div>
      </header>

      <div className="mobile-content">
        {page && <h1 id="mobile-page-heading" className="mobile-title" ref={heading} tabIndex="-1">{pages[page]}</h1>}

        {device?.mock && <div className="mock-strip" role="status">
          <span>{t('mobile.mockStrip')}</span>
          <button type="button" disabled={isBusy} onClick={exitMock}>{t('mobile.mockExit')}</button>
        </div>}

        {/* 首页 */}
        {!page && <nav aria-label={t('nav.tools')} className="home-grid">
          <button id="tool-camera" className="hero-card" onClick={() => openTool('camera')}>
            <div className="hero-card__copy">
              <span className={'hero-tag' + (cameraConnected ? ' is-live' : '')}>
                {cameraConnected ? t('mobile.home.cameraReady') : 'LUMIX DC-S5'}
              </span>
              <strong>{cameraConnected ? t('mobile.home.cameraConnected') : t('mobile.home.cameraConnect')}</strong>
              <small>{cameraHint}</small>
            </div>
            <div className="hero-card__visual" aria-hidden="true" />
          </button>

          <div className="menu-card">
            <MenuEntry
              id="lut"
              icon={<BgColorsOutlined />}
              title={t('mobile.home.lutTitle')}
              subtitle={t('mobile.home.lutSub')}
              badge={device?.lut?.enabled ? t('mobile.home.lutBadge') : null}
              openTool={openTool}
            />
            <MenuEntry
              id="formats"
              icon={<ExpandOutlined />}
              title={t('mobile.home.formatsTitle')}
              subtitle={t('mobile.home.formatsSub')}
              badge={device?.unlock?.unlocked ? t('mobile.home.formatsBadge') : null}
              openTool={openTool}
            />
            <MenuEntry
              id="audio"
              icon={<SoundOutlined />}
              title={t('mobile.home.audioTitle')}
              subtitle={t('mobile.home.audioSub')}
              badge={live.length ? t('mobile.home.audioBadge', { count: live.length }) : null}
              openTool={openTool}
            />
          </div>

          <div className="menu-card">
            <button id="btnSupportAuthor" type="button" className="menu-item" onClick={handleSupportAuthor}>
              <span className="menu-icon is-star" aria-hidden="true"><StarOutlined /></span>
              <span className="menu-copy">
                <span className="menu-copy__top">
                  <strong>{t('support.title')}</strong>
                  <em className="menu-badge is-star">{t('support.badge')}</em>
                </span>
                <small>{t('support.subtitle')}</small>
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
            <span>{t('mobile.camera.ptpWarn')}</span>
          </div>}

          {device?.connected && <div className="white-card">
            <div className="kv-list">
              <div><span>{t('mobile.camera.device')}</span><strong>LUMIX DC-S5 {device.mock ? '(Mock)' : ''}</strong></div>
              <div><span>{t('mobile.camera.fw')}</span><strong>{device.verified ? t('mobile.camera.fwOk') : t('mobile.camera.fwBad', { ver: device.body_version })}</strong></div>
              <div><span>{t('mobile.camera.unlock6k')}</span><strong>{device.unlock?.unlocked ? t('mobile.camera.unlocked') : t('mobile.camera.locked')}</strong></div>
              <div><span>{t('mobile.camera.customSound')}</span><strong>{live.length ? t('mobile.camera.customCount', { count: live.length }) : t('mobile.camera.stockSound')}</strong></div>
            </div>
            <div className="btn-row" style={{ marginTop: 14 }}>
              <button type="button" className="ghost-btn" onClick={() => openTool('formats')}>{t('mobile.camera.goUnlock')}</button>
              <button type="button" className="ghost-btn" onClick={() => openTool('audio')}>{t('mobile.camera.goAudio')}</button>
            </div>
          </div>}

          {device?.error && !device?.connected && device?.mode !== 'ptp' && <div className="notice-bar is-error">
            <WarningOutlined />
            <span>{device.error}</span>
          </div>}

          <button id="btnConnectCamera" className="primary-btn" disabled={isBusy} onClick={() => refreshDevice(true)}>
            {checking ? <ReloadOutlined spin /> : <UsbOutlined />}
            {checking ? t('mobile.camera.connecting') : device?.connected ? t('mobile.camera.refresh') : t('mobile.camera.connect')}
          </button>
        </section>}

        {/* 实时 LUT 直出页 */}
        {(lutSession > 0 || page === 'lut') && <div hidden={page !== 'lut'}><LutDirect
          key={lutSession}
          active={page === 'lut'}
          backHandlerRef={lutBack}
          onBusyChange={setLutPending}
          onViewChange={setLutView}
          mobile
          deviceState={device}
          busy={isBusy}
          progress={progress}
          onOpenConnect={() => openTool('camera')}
          onSetLut={({ enable, mode, playbackFix }) => runExclusive(
            enable ? t('lut.enabling') : t('lut.restoring'),
            () => invokeNative('setLut', { enable, mode, playbackFix }),
          )}
          onUploadLutSlot={({ slot, beefBase64 }) => runExclusive(
            t('lut.uploadingSlot'),
            () => invokeNative('uploadLutSlot', { slot, beefBase64 }),
            false,
          )}
          onSaveVlt={(filename, content) => invokeNative('saveVlt', { filename, content })}
        /></div>}

        {/* 片门全开解锁页 */}
        {page === 'formats' && <OpenGate
          mobile
          deviceState={device}
          busy={isBusy}
          progress={progress}
          onOpenConnect={() => openTool('camera')}
          onSetUnlock={enable => runExclusive(
            t('status.busy'),
            () => invokeNative('setUnlock', { unlock: enable }),
          )}
        />}

        {/* 设置页 */}
        {page === 'settings' && <section className="stack">
          <div className="white-card">
            <div className="card-head">
              <strong><GlobalOutlined style={{ marginRight: 6 }} />{t('settings.langTitle')}</strong>
            </div>
            <div className="lang-seg" role="radiogroup" aria-label={t('settings.langTitle')}>
              {LANGUAGES.map(item => (
                <button
                  key={item.code}
                  type="button"
                  role="radio"
                  aria-checked={lang === item.code}
                  className={lang === item.code ? 'is-active' : ''}
                  onClick={() => setLang(item.code)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <p className="settings-hint">{t('settings.langDesc')}</p>
          </div>

          <div className="white-card">
            <div className="card-head">
              <strong><CloudSyncOutlined style={{ marginRight: 6 }} />{t('settings.otaTitle')}</strong>
              <span className="muted-pill">{t('settings.otaTag')}</span>
            </div>
            <p className="settings-hint" style={{ marginTop: 0 }}>{t('settings.otaDesc', { version: appVersion })}</p>
            <button id="btnMobileOta" type="button" className="ghost-btn" disabled style={{ marginTop: 10 }}>
              <CloudSyncOutlined />{t('settings.otaBtn')}
            </button>
          </div>

          <div className="white-card">
            <div className="card-head">
              <strong><StarOutlined style={{ marginRight: 6, color: '#d97706' }} />{t('support.title')}</strong>
              <em className="menu-badge is-star">GitHub Star</em>
            </div>
            <p className="settings-hint" style={{ marginTop: 0 }}>{t('support.desc')}</p>
            <button id="btnMobileSettingsStar" type="button" className="primary-btn" style={{ marginTop: 10 }} onClick={handleSupportAuthor}>
              <GithubOutlined />{t('support.btn')}
            </button>
            {linkError && <p className="inline-err">{linkError}</p>}
          </div>

          <div className="white-card">
            <div className="card-head">
              <strong>{t('settings.aboutTitle')}</strong>
              <span className="muted-pill">v{appVersion}</span>
            </div>
            <div className="kv-list">
              <div><span>{t('settings.versionLabel')}</span><strong>v{appVersion}</strong></div>
              <div><span>{t('settings.supportCamera')}</span><strong>DC-S5 (v2.9)</strong></div>
              <div><span>{t('settings.runMode')}</span><strong>{t('settings.runModeAndroid')}</strong></div>
            </div>
          </div>
        </section>}

        {/* 相机音效替换页 */}
        {page === 'audio' && <section className="stack">
          {firmwareBlocked && <div role="alert" className="notice-bar is-warn">
            <WarningOutlined />
            <span>{t('mobile.audio.fwOnly29')}</span>
          </div>}

          {/* 1. 选择声音 */}
          <div className="white-card">
            <div className="card-head">
              <strong>{t('mobile.audio.step1')}</strong>
              {audio && <span className="muted-tag">
                {t('mobile.audio.sec', { sec: audio.duration.toFixed(2) })}{audio.originalDuration > MAX_SECONDS ? t('mobile.audio.trimmed') : ''}
              </span>}
            </div>

            {audio ? (
              <div className="wave-wrap">
                <Waveform active buffer={audio.buffer} />
              </div>
            ) : (
              <div className="wave-placeholder">{t('mobile.audio.placeholder')}</div>
            )}

            <div className="btn-row" style={{ marginTop: 12 }}>
              <label className={'file-btn ' + (audio ? 'ghost-btn' : 'primary-btn')}>
                <FolderOpenOutlined />{loadingAudio ? t('mobile.audio.parsing') : audio ? t('mobile.audio.reselect') : t('mobile.audio.select')}
                <input aria-label={t('mobile.audio.select')} type="file" accept="audio/*" disabled={loadingAudio || isBusy} onChange={selectFile} />
              </label>
              {audio && <button id="btnPreviewAudio" type="button" className="ghost-btn" disabled={isBusy} onClick={() => preview(audio.buffer, setAudioError)}>
                {playing ? <PauseOutlined /> : <PlayCircleOutlined />}{playing ? t('mobile.audio.stop') : t('mobile.audio.preview')}
              </button>}
            </div>
            {audioError && <p className="inline-err">{audioError}</p>}
          </div>

          {/* 2. 选择替换位置 */}
          <div className="white-card">
            <div className="card-head">
              <strong>{t('mobile.audio.step2')}</strong>
              <div className="seg-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  disabled={isBusy}
                  aria-selected={slotTab === 'common'}
                  className={slotTab === 'common' ? 'is-active' : ''}
                  onClick={() => setSlotTab('common')}
                >
                  {t('mobile.audio.tabCommon')}
                </button>
                <button
                  type="button"
                  role="tab"
                  disabled={isBusy}
                  aria-selected={slotTab === 'all'}
                  className={slotTab === 'all' ? 'is-active' : ''}
                  onClick={() => setSlotTab('all')}
                >
                  {t('mobile.audio.tabAll')}
                </button>
              </div>
            </div>

            {slotTab === 'common' ? (
              <div className="preset-list" role="radiogroup" aria-label={t('mobile.audio.tabCommon')}>
                {COMMON_PRESETS.map(rawPreset => {
                  const preset = localizePreset(rawPreset, lang);
                  const isActive = preset.id === activePreset.id;
                  const states = preset.indices.map(i => slotState({ ...catalog[i], ...entryByIndex.get(i) }, originals[i]));
                  const replacedIndices = preset.indices.filter((i, idx) => states[idx] === '已替换' && originals[i]);
                  const stateTag = states.every(s => s === '已替换')
                    ? t('mobile.audio.replaced')
                    : states.some(s => s === '已替换')
                      ? t('mobile.audio.partReplaced')
                      : null;
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
                        {stateTag && <em className="mini-tag">{stateTag}</em>}
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
                        <UndoOutlined />{t('mobile.audio.restore')}
                      </button>
                    )}
                  </div>;
                })}
              </div>
            ) : (
              <>
                <div className="quick-pills">
                  <button type="button" disabled={isBusy} onClick={() => setSelected([1, 2, 3])}>{t('mobile.audio.focusGroup')}</button>
                  <button type="button" disabled={isBusy} onClick={() => setSelected([20, 21, 22])}>{t('mobile.audio.shutterGroup')}</button>
                  <button type="button" disabled={isBusy} onClick={() => setSelected([11, 12, 13])}>{t('mobile.audio.burstGroup')}</button>
                  <button type="button" disabled={isBusy} onClick={() => setSelected(Array.from({ length: 28 }, (_, i) => i))}>{t('mobile.audio.selectAll')}</button>
                  <button type="button" disabled={isBusy} onClick={() => setSelected([])}>{t('mobile.audio.clear')}</button>
                  {ready && Object.keys(originals).length > 0 && (
                    <button type="button" className="is-restore" onClick={() => setConfirmRestoreTarget(null)}>{t('mobile.audio.restoreAll')}</button>
                  )}
                </div>

                <div className="compact-slots">
                  {allRows.map(row => {
                    const checked = selected.includes(row.index);
                    const st = slotState(row, originals[row.index]);
                    const isEdit = editingSlot === row.index;
                    const note = soundNote(row.index, lang);
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
                            <span className="slot-label">{soundName(row.index, labels, lang)}</span>
                            {st === '已替换' && <em className="mini-tag">{t('mobile.audio.modified')}</em>}
                          </span>
                          {note && <small className="slot-note">{note}</small>}
                        </span>
                      </label>
                      <div className="compact-slot__btns">
                        {ready && <button
                          type="button"
                          aria-label={`#${row.index}`}
                          onClick={() => { setEditingSlot(isEdit ? null : row.index); setEditingText(labels[row.index] || ''); }}
                        >
                          <EditOutlined />
                        </button>}
                        {ready && originals[row.index] && st === '已替换' && (
                          <button type="button" onClick={() => setConfirmRestoreTarget(row.index)}>{t('mobile.audio.restore')}</button>
                        )}
                      </div>
                      {isEdit && <div className="rename-inline">
                        <input
                          type="text"
                          maxLength={80}
                          value={editingText}
                          placeholder={t('mobile.audio.renamePlaceholder')}
                          onChange={e => setEditingText(e.target.value)}
                        />
                        <button type="button" onClick={() => saveSlotLabel(row.index)}>{t('mobile.audio.save')}</button>
                      </div>}
                    </div>;
                  })}
                </div>
              </>
            )}

            {confirmRestoreTarget !== undefined && <div className="confirm-bar">
              <span>{confirmRestoreTarget === null
                ? t('mobile.audio.confirmRestoreAll')
                : t('mobile.audio.confirmRestore', {
                    target: Array.isArray(confirmRestoreTarget)
                      ? confirmRestoreTarget.map(i => `#${i}`).join(', ')
                      : `#${confirmRestoreTarget}`,
                  })}</span>
              <div>
                <button type="button" className="primary-btn is-compact" disabled={isBusy} onClick={() => handleRestoreSounds(confirmRestoreTarget)}>{t('mobile.audio.confirm')}</button>
                <button type="button" className="ghost-btn is-compact" disabled={isBusy} onClick={() => setConfirmRestoreTarget(undefined)}>{t('mobile.audio.cancel')}</button>
              </div>
            </div>}
          </div>

          {/* 进度提示 */}
          {busyLabel && <div className="progress-card" role="status">
            <div className="progress-card__head">
              <span>{busyLabel}</span>
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
            {burnResult.rescan && <button type="button" className="ghost-btn is-compact" disabled={isBusy} onClick={handleScanMemory}>{t('mobile.audio.rescan')}</button>}
          </div>}

          {plan && !plan.ok && !plan.needsScan && <div role="alert" className="notice-bar is-error">
            <WarningOutlined />
            <span>{t('mobile.audio.noSpace')}</span>
          </div>}

          {/* 主操作按钮 */}
          {!ready ? (
            <button type="button" className="primary-btn" disabled={isBusy} onClick={() => openTool('camera')}>
              <UsbOutlined />{t('mobile.audio.connectFirst')}
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
                ? t('mobile.audio.pickFirst')
                : slotTab === 'common'
                  ? t('mobile.audio.writePreset', { label: activePreset.label })
                  : t('mobile.audio.writeSelected', { count: activeIndices.length })}
            </button>
          )}

          {/* 低频高级诊断折叠入口 */}
          {ready && <div className="quiet-footer">
            <button type="button" className="text-link" onClick={() => setShowAdvancedMem(v => !v)}>
              {showAdvancedMem ? t('mobile.audio.advToggleOpen') : t('mobile.audio.advToggleClosed')}
            </button>
            {showAdvancedMem && <div className="white-card adv-box">
              <div className="kv-list">
                <div><span>{t('mobile.audio.freeSpace')}</span><strong>{memoryMap ? `${Math.floor(stats.totalFree / BLOCK).toLocaleString()} KiB` : t('mobile.audio.unscanned')}</strong></div>
                <div><span>{t('mobile.audio.usedSpace')}</span><strong>{`${Math.floor(stats.used / BLOCK).toLocaleString()} KiB`}</strong></div>
              </div>
              <div className="btn-row" style={{ marginTop: 10 }}>
                <button id="btnScanMemory" type="button" className="ghost-btn is-compact" disabled={isBusy} onClick={handleScanMemory}>
                  <ScanOutlined />{t('mobile.audio.rescan')}
                </button>
                <button
                  id="btnExportMemory"
                  type="button"
                  className="ghost-btn is-compact"
                  disabled={isBusy || !memoryMap}
                  onClick={() => invokeNative('exportMemory', { version: memoryMap.bodyVersion })}
                >
                  <DownloadOutlined />{t('mobile.audio.exportMem')}
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
