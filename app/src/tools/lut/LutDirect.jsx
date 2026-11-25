import { Alert, Button, Card, Flex, Popconfirm, Progress, Space, Switch, Tag } from 'antd';
import {
  ArrowLeftOutlined, BgColorsOutlined, CheckCircleFilled, DownloadOutlined,
  EyeOutlined, FolderOpenOutlined, PlaySquareOutlined, RightOutlined,
  ThunderboltOutlined, UndoOutlined, UsbOutlined, WarningOutlined,
} from '@ant-design/icons';
import { useRef, useState } from 'react';
import { useI18n } from '../../i18n';
import LutGuide from './LutGuide';
import { buildPresetVlt, convertCubeToVlt } from './vltConverter.mjs';
import './LutDirect.css';

function downloadBlobFallback(filename, content) {
  const blob = new Blob([content], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function LutDirect({
  mobile = false,
  device = null,
  deviceState = null,
  busy = false,
  progress = null,
  onOpenConnect = null,
  onSetLut = null,
  onSaveVlt = null,
}) {
  const { t } = useI18n();
  const [subView, setSubView] = useState(null); // null | 'guide' | 'vlt'
  const [mode, setMode] = useState('fast');
  const [playbackFix, setPlaybackFix] = useState(true);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [error, setError] = useState('');
  const [vltMsg, setVltMsg] = useState(null);
  const fileInputRef = useRef(null);

  // Normalize Desktop vs Mobile state
  const api = mobile ? null : device?.api;
  const cameraInfo = mobile ? (deviceState || {}) : (device?.device || {});
  const lut = cameraInfo?.lut || null;
  const connected = !!cameraInfo?.connected && !cameraInfo?.error;
  const supported = !!lut?.supported;
  const enabled = !!lut?.enabled;
  const working = mobile
    ? (busy && (progress?.phase === 'lut-enable' || progress?.phase === 'lut-restore'))
    : (device?.busy?.tool === 'lut-direct');
  const disabled = mobile ? !!busy : (!!device?.locked || working);
  const curProgress = mobile ? progress : device?.progress;
  const pct = working && curProgress?.total > 0
    ? Math.min(100, Math.round(((curProgress.done || 0) / curProgress.total) * 100))
    : 0;

  async function run(enable) {
    if (disabled) return;
    setConfirmRestore(false);
    setError('');
    try {
      let res;
      if (mobile) {
        if (!onSetLut) return;
        res = await onSetLut({ enable, mode, playbackFix });
      } else {
        if (!api) return;
        res = await device.runOperation({
          tool: 'lut-direct',
          label: enable ? t('lut.enabling') : t('lut.restoring'),
          execute: () => api.setLut({ enable, mode, playbackFix }),
        });
      }
      if (!res?.ok) setError(res?.error || t('lut.opFailed'));
    } catch (err) {
      setError(err.message || String(err));
    }
  }

  async function saveVltFile(filename, content) {
    setVltMsg(null);
    try {
      const saver = mobile ? onSaveVlt : api?.saveVlt;
      if (saver) {
        const res = await saver(filename, content);
        if (res?.canceled) return;
        if (!res?.ok) {
          setVltMsg({ type: 'error', text: res?.error || t('lut.vltSaveFail') });
          return;
        }
        setVltMsg({ type: 'success', text: t('lut.vltSaved', { name: filename }) });
      } else {
        downloadBlobFallback(filename, content);
        setVltMsg({ type: 'success', text: t('lut.vltSaved', { name: filename }) });
      }
    } catch (err) {
      setVltMsg({ type: 'error', text: err.message || String(err) });
    }
  }

  async function onPickCube(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setVltMsg(null);
    try {
      const text = await file.text();
      const converted = convertCubeToVlt(text, file.name);
      await saveVltFile(converted.filename, converted.content);
    } catch (err) {
      setVltMsg({ type: 'error', text: err.message || String(err) });
    }
  }

  // Level-3 Sub-view: Authentic DC-S5 Animated Menu Simulator
  if (subView === 'guide') {
    const body = (
      <div>
        <div className="lut-subhead">
          <button type="button" className="lut-subhead__back" aria-label={t('nav.back')} onClick={() => setSubView(null)}>
            <ArrowLeftOutlined />
          </button>
          <span className="lut-subhead__title">{t('lut.subGuideTitle')}</span>
        </div>
        <LutGuide />
      </div>
    );
    return mobile ? <div className="gate-card">{body}</div> : <Card>{body}</Card>;
  }

  // Level-3 Sub-view: .cube -> .VLT Converter & Built-in Presets
  if (subView === 'vlt') {
    const body = (
      <div>
        <div className="lut-subhead">
          <button type="button" className="lut-subhead__back" aria-label={t('nav.back')} onClick={() => setSubView(null)}>
            <ArrowLeftOutlined />
          </button>
          <span className="lut-subhead__title">{t('lut.subVltTitle')}</span>
        </div>

        <input ref={fileInputRef} type="file" accept=".cube,.CUBE" style={{ display: 'none' }} onChange={onPickCube} />

        {mobile ? (
          <button type="button" className="btn btn-primary" style={{ width: '100%' }} onClick={() => fileInputRef.current?.click()}>
            <FolderOpenOutlined /> {t('lut.convertCubeBtn')}
          </button>
        ) : (
          <Button type="primary" block size="large" icon={<FolderOpenOutlined />} onClick={() => fileInputRef.current?.click()}>
            {t('lut.convertCubeBtn')}
          </Button>
        )}

        <div className="lut-presets">
          <button type="button" className="lut-preset" onClick={() => { const p = buildPresetVlt('cinewarm'); saveVltFile(p.filename, p.content); }}>
            <div className="lut-preset__swatch is-cine" />
            <div className="lut-preset__body">
              <span>CINEWARM.VLT</span>
              <DownloadOutlined />
            </div>
          </button>
          <button type="button" className="lut-preset" onClick={() => { const p = buildPresetVlt('bw'); saveVltFile(p.filename, p.content); }}>
            <div className="lut-preset__swatch is-bw" />
            <div className="lut-preset__body">
              <span>BWHC.VLT</span>
              <DownloadOutlined />
            </div>
          </button>
        </div>

        <p className="lut-foot-note" style={{ marginTop: 12 }}>{t('lut.vltRuleHint')}</p>
        {vltMsg && (
          mobile
            ? <div className={'m-alert ' + (vltMsg.type === 'success' ? 'is-ok' : 'is-warn')} style={{ marginTop: 10 }}>{vltMsg.text}</div>
            : <Alert type={vltMsg.type} showIcon title={vltMsg.text} style={{ marginTop: 12 }} />
        )}
      </div>
    );
    return mobile ? <div className="gate-card">{body}</div> : <Card>{body}</Card>;
  }

  // Level-2 Main View: Visual, clean, zero text walls!
  const hero = (
    <div className="lut-hero" aria-hidden="true">
      <div className="lut-hero__wipe" />
      <div className="lut-hero__divider" />
      <span className={'lut-hero__status' + (enabled ? ' is-on' : '')}>
        {enabled ? <><CheckCircleFilled /> {t('lut.enabledTag')}</> : connected ? t('lut.stockTag') : t('status.disconnected')}
      </span>
      <span className="lut-hero__label">V-Log</span>
      <span className="lut-hero__label is-lut">Real-Time LUT</span>
    </div>
  );

  const controls = (
    <Flex vertical gap={12}>
      {hero}

      {!connected && (
        mobile ? (
          <button type="button" className="btn btn-primary" onClick={onOpenConnect}>
            <UsbOutlined /> {t('lut.goConnect')}
          </button>
        ) : (
          <Button id="lutConnectBtn" type="primary" size="large" icon={<UsbOutlined />} onClick={() => device?.navigate?.('connection')}>
            {t('lut.goConnect')}
          </Button>
        )
      )}

      {connected && !supported && (
        mobile
          ? <div className="m-alert is-warn"><WarningOutlined /> {lut?.error || t('lut.unsupportedTitle')}</div>
          : <Alert type="error" showIcon title={t('lut.unsupportedTitle')} description={lut?.error || t('lut.unsupportedDesc')} />
      )}

      {connected && supported && (
        <>
          <div className="lut-modes" role="radiogroup" aria-label={t('lut.modeLabel')}>
            <button
              type="button"
              className={'lut-mode-btn' + (mode === 'fast' ? ' is-selected' : '')}
              disabled={disabled}
              onClick={() => setMode('fast')}
            >
              <span className="lut-mode-btn__ico"><ThunderboltOutlined /></span>
              <span className="lut-mode-btn__copy">
                <strong>{t('lut.modeFastShort')}</strong>
                <span>~2s · {t('lut.recommended')}</span>
              </span>
            </button>
            <button
              type="button"
              className={'lut-mode-btn' + (mode === 'lossless' ? ' is-selected' : '')}
              disabled={disabled}
              onClick={() => setMode('lossless')}
            >
              <span className="lut-mode-btn__ico"><BgColorsOutlined /></span>
              <span className="lut-mode-btn__copy">
                <strong>{t('lut.modeLosslessShort')}</strong>
                <span>~3.5s · {t('lut.bitExact')}</span>
              </span>
            </button>
          </div>

          <div className="lut-toggle-row">
            <span className="lut-toggle-row__left">
              <EyeOutlined />
              <span>{t('lut.playbackFixShort')}</span>
            </span>
            {mobile ? (
              <input type="checkbox" checked={playbackFix} disabled={disabled} onChange={e => setPlaybackFix(e.target.checked)} />
            ) : (
              <Switch size="small" checked={playbackFix} disabled={disabled} onChange={setPlaybackFix} />
            )}
          </div>

          {working && (
            mobile
              ? <div className="m-progress"><div className="m-progress__bar" style={{ width: `${pct}%` }} /></div>
              : <Progress percent={pct} status="active" showInfo={false} />
          )}

          {mobile ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-primary" style={{ flex: 1 }} disabled={disabled} onClick={() => run(true)}>
                <BgColorsOutlined /> {enabled ? t('lut.updateBtn') : t('lut.enableBtn')}
              </button>
              {enabled && !confirmRestore && (
                <button type="button" className="btn" disabled={disabled} onClick={() => setConfirmRestore(true)}>
                  <UndoOutlined /> {t('lut.restoreBtn')}
                </button>
              )}
              {enabled && confirmRestore && (
                <button type="button" className="btn btn-danger" disabled={disabled} onClick={() => run(false)}>
                  {t('lut.restoreConfirmOk')}
                </button>
              )}
            </div>
          ) : (
            <Space wrap>
              <Button id="btnEnableLut" type="primary" size="large" icon={<BgColorsOutlined />} loading={working} disabled={disabled} onClick={() => run(true)}>
                {enabled ? t('lut.updateBtn') : t('lut.enableBtn')}
              </Button>
              {enabled && (
                <Popconfirm
                  title={t('lut.restoreConfirmTitle')}
                  okText={t('lut.restoreConfirmOk')}
                  cancelText={t('lut.cancel')}
                  disabled={disabled}
                  onConfirm={() => run(false)}
                >
                  <Button id="btnRestoreLut" size="large" icon={<UndoOutlined />} loading={working} disabled={disabled}>
                    {t('lut.restoreBtn')}
                  </Button>
                </Popconfirm>
              )}
            </Space>
          )}
        </>
      )}

      {error && (
        mobile
          ? <div className="m-alert is-warn">{error}</div>
          : <Alert type="error" showIcon title={error} />
      )}
    </Flex>
  );

  const subEntries = (
    <div className="lut-subgrid">
      <button type="button" className="lut-subtile" onClick={() => setSubView('guide')}>
        <span className="lut-subtile__left">
          <span className="lut-subtile__ico"><PlaySquareOutlined /></span>
          <span className="lut-subtile__text">
            <strong>{t('lut.subGuideTitle')}</strong>
            <span>{t('lut.subGuideSub')}</span>
          </span>
        </span>
        <RightOutlined style={{ opacity: 0.45 }} />
      </button>
      <button type="button" className="lut-subtile" onClick={() => setSubView('vlt')}>
        <span className="lut-subtile__left">
          <span className="lut-subtile__ico is-blue"><FolderOpenOutlined /></span>
          <span className="lut-subtile__text">
            <strong>{t('lut.subVltTitle')}</strong>
            <span>{t('lut.subVltSub')}</span>
          </span>
        </span>
        <RightOutlined style={{ opacity: 0.45 }} />
      </button>
    </div>
  );

  if (mobile) {
    return (
      <section className="m-lut" aria-label={t('nav.lut')}>
        <div className="gate-card">{controls}</div>
        {subEntries}
        <p className="lut-foot-note">{t('lut.ramOnlyMeta')}</p>
      </section>
    );
  }

  return (
    <Flex vertical gap={14} className="lut-page">
      <Card>{controls}</Card>
      {subEntries}
      <p className="lut-foot-note">{t('lut.ramOnlyMeta')}</p>
    </Flex>
  );
}
