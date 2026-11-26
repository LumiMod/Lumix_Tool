import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Modal } from 'antd';
import {
  ArrowLeftOutlined, ArrowRightOutlined, BookOutlined, CheckOutlined, DownOutlined,
  LoadingOutlined, PoweroffOutlined, SettingOutlined, UsbOutlined, WarningOutlined,
} from '@ant-design/icons';
import { useI18n } from '../../i18n';
import cameraPhoto from '../../assets/camera/dc-s5-front.webp';
import LutGuide from './LutGuide';
import LutTransfer from './LutTransfer';
import './LutDirect.css';

const overview = { page: 'home' };

export default function LutDirect({
  mobile = false, active = true, device, navigate, deviceState, busy, progress,
  onOpenConnect, onSetLut, onUploadLutSlot, onSaveVlt, backHandlerRef, onBusyChange, onViewChange,
}) {
  const { t } = useI18n();
  const camera = (mobile ? deviceState : device?.device) || {};
  const connected = !!camera.connected && !camera.error;
  const lut = camera.lut;
  const supported = !!lut?.supported;
  const enabled = !!lut?.enabled;
  const locked = mobile ? busy : device?.locked;
  const [view, setView] = useState(() => (mobile && globalThis.history?.state?.lutView) || overview);
  const [action, setAction] = useState('');
  const [dialog, setDialog] = useState({ kind: 'success', open: false });
  const [issue, setIssue] = useState('');
  const [restored, setRestored] = useState(false);
  const [transferPending, setTransferPending] = useState(false);
  const [draft, setDraft] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const actionLock = useRef(false);
  const header = useRef(null);
  const opener = useRef(null);
  const moved = useRef(false);
  const isBlocked = !!action || transferPending;
  useEffect(() => { onBusyChange?.(isBlocked); }, [isBlocked, onBusyChange]);
  const mode = draft?.mode ?? (lut?.mode === 'lossless' ? 'lossless' : 'fast');
  const playbackFix = draft?.playbackFix ?? (enabled ? !!lut?.playbackFix : true);
  const feed = mobile ? progress : device?.progress;
  const targetPhase = action === 'restore' ? 'lut-restore' : 'lut-enable';
  const amount = action && feed?.phase === targetPhase && feed.total > 0
    ? Math.max(0, Math.min(100, Math.round(100 * feed.done / feed.total))) : null;

  useEffect(() => {
    if (connected) return;
    setDraft(null);
    setRestored(false);
    setSettingsOpen(false);
  }, [connected]);

  useEffect(() => {
    if (!mobile) return;
    const pop = () => {
      if (history.state?.tool === 'lut') {
        moved.current = true;
        setView(history.state.lutView || overview);
      }
    };
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }, [mobile]);

  useEffect(() => {
    onViewChange?.(view.page);
    if (!moved.current) return;
    moved.current = false;
    if (view.page === 'home') {
      document.getElementById(opener.current)?.focus();
    } else {
      const title = mobile ? document.getElementById('mobile-page-heading') : header.current;
      title?.focus({ preventScroll: true });
      title?.scrollIntoView({ block: 'nearest' });
    }
  }, [view, mobile, onViewChange]);

  function openView(next, trigger) {
    if (isBlocked) return;
    if (view.page === 'home') opener.current = (trigger || document.activeElement)?.id;
    moved.current = true;
    if (mobile) history.pushState({ tool: 'lut', lutView: next }, '', '#lut/' + next.page);
    setView(next);
  }

  function back() {
    if (dialog.open) { closeDialog(); return true; }
    if (isBlocked) return true;
    if (view.page === 'home') return false;
    if (mobile && history.state?.lutView) history.back();
    else {
      moved.current = true;
      setView(view.fromTransfer ? { page: 'transfer' } : overview);
    }
    return true;
  }
  useImperativeHandle(backHandlerRef, () => back);

  function closeDialog() {
    setDialog(current => ({ ...current, open: false }));
  }

  function refocusAfterDialog() {
    if (!active || view.page !== 'home') return;
    const restore = dialog.kind === 'restore' && document.getElementById('btnRestoreLut');
    (restore || document.getElementById('btnEnableLut'))?.focus();
  }

  function openGuide(route = 'card', trigger) {
    closeDialog();
    openView({ page: 'guide', route, fromTransfer: view.page === 'transfer' }, trigger);
  }

  function connect() {
    if (mobile) onOpenConnect();
    else navigate('connection');
  }

  async function apply(enable) {
    if (locked || actionLock.current || !connected || !supported) return;
    actionLock.current = true;
    closeDialog();
    setIssue('');
    setRestored(false);
    setSettingsOpen(false);
    setAction(enable ? 'activate' : 'restore');
    try {
      const options = { enable, mode, playbackFix };
      const result = mobile ? await onSetLut(options) : await device.runOperation({
        tool: 'lut-direct', label: t(enable ? 'lut.enabling' : 'lut.restoring'),
        execute: () => device.api.setLut(options),
      });
      if (!result?.ok) throw new Error(result?.error || t('lut.opFailed'));
      setDraft(null);
      if (enable) setDialog({ kind: 'success', open: true });
      else setRestored(true);
    } catch (error) {
      setIssue(error.message || String(error));
    } finally {
      actionLock.current = false;
      setAction('');
    }
  }

  function upload(options) {
    return mobile ? onUploadLutSlot(options) : device.runOperation({
      tool: 'lut-direct', label: t('lut.uploadingSlot'),
      execute: () => device.api.uploadLutSlot(options),
    });
  }

  const state = !connected ? 'disconnected' : !supported ? 'unsupported' : enabled ? 'active' : 'ready';
  const status = action ? t(action === 'activate' ? 'lut.enabling' : 'lut.restoring') : t('lut.state.' + state);
  const canActivate = connected && supported;
  const transferOpen = view.page === 'transfer' || view.fromTransfer;
  const subTitle = t(view.page === 'guide' ? 'lut.guideTitle' : 'lut.transferTitle');

  return <section className="lut-studio" aria-label={t('nav.lut')}>
    {view.page === 'home' ? <>
      <section className="lut-activation" aria-labelledby="lut-activation-title">
        <div className="lut-activation__hero">
          <div className="lut-camera-art" aria-hidden="true"><img src={cameraPhoto} alt="" /></div>
          <div className="lut-activation__copy">
            <div className={'lut-state is-' + state} role="status"><i aria-hidden="true" />{status}</div>
            <h2 id="lut-activation-title">{t('lut.activateTitle')}</h2>
            <p>{t('lut.hint.' + state)}</p>
            <div className="lut-actions">
              {!connected && <button id="lutConnectBtn" type="button" className="lut-btn is-light" onClick={connect}><UsbOutlined />{t('nav.connection')}</button>}
              {canActivate && <>
                <button id="btnEnableLut" type="button" className="lut-btn is-light" disabled={locked || !!action} onClick={() => apply(true)}>
                  {action === 'activate' ? <LoadingOutlined spin /> : <PoweroffOutlined />}{t(action === 'activate' ? 'lut.enabling' : enabled ? 'lut.updateBtn' : 'lut.enableBtn')}
                </button>
                <button type="button" className="lut-settings-toggle" disabled={!!action} aria-expanded={settingsOpen} aria-controls="lut-settings" onClick={() => setSettingsOpen(!settingsOpen)}>
                  <SettingOutlined />{t('lut.settings')}<DownOutlined className={settingsOpen ? 'is-open' : ''} />
                </button>
              </>}
              {connected && !supported && lut?.error && <span className="lut-firmware-note">{lut.error}</span>}
            </div>
          </div>
        </div>
        {settingsOpen && canActivate && <div className="lut-settings" id="lut-settings">
          <fieldset disabled={!!action}><legend>{t('lut.modeLabel')}</legend><div className="lut-mode-options">
            {['fast', 'lossless'].map(value => <label key={value}>
              <input type="radio" name="lut-mode" checked={mode === value} onChange={() => setDraft({ mode: value, playbackFix })} />{t('lut.mode.' + value)}
            </label>)}
          </div></fieldset>
          <label className="lut-check"><input type="checkbox" checked={playbackFix} disabled={!!action} onChange={e => setDraft({ mode, playbackFix: e.target.checked })} />{t('lut.playback')}</label>
          {enabled && <button type="button" id="btnRestoreLut" className="lut-btn" disabled={locked || !!action} onClick={() => setDialog({ kind: 'restore', open: true })}>{t('lut.restoreBtn')}</button>}
        </div>}
        {action && <div className="lut-live" role="status">
          <div><LoadingOutlined spin /><strong>{status}</strong>{amount !== null && <b>{amount}%</b>}</div>
          <progress max="100" value={amount ?? undefined} aria-label={status} />
          <span>{t('lut.keepUsb')}</span>
        </div>}
        {issue && <p className="lut-result is-error" role="alert"><WarningOutlined />{issue}</p>}
        {restored && <p className="lut-result" role="status"><CheckOutlined />{t('lut.restored')}</p>}
      </section>
      <div className="lut-entry-grid">
        <button type="button" id="lut-transfer-entry" className="lut-entry" disabled={isBlocked} onClick={e => openView({ page: 'transfer' }, e.currentTarget)}>
          <div className="lut-entry-art is-transfer" aria-hidden="true">
            <div className="lut-palette"><i /><i /><i /><i /><i /><i /><i /><i /></div>
          </div>
          <div className="lut-entry-body"><div className="lut-entry-title"><h3>{t('lut.transferTitle')}</h3><span className="lut-beta">Beta</span></div>
            <p>{t('lut.transferIntro')}</p><span className="lut-entry-link">{t('lut.pickLut')}<ArrowRightOutlined /></span></div>
        </button>
        <button type="button" id="lut-guide-entry" className="lut-entry" disabled={isBlocked} onClick={e => openGuide('card', e.currentTarget)}>
          <div className="lut-entry-art is-guide" aria-hidden="true">
            <div className="lut-menu-thumb">
              <span className="lut-menu-thumb__heading">V-Log</span>
              <span className="lut-menu-thumb__selection">LUT<ArrowRightOutlined /></span>
              <i /><i />
            </div>
          </div>
          <div className="lut-entry-body"><div className="lut-entry-title"><h3>{t('lut.guideTitle')}</h3></div>
            <p>{t('lut.guideIntro')}</p><span className="lut-entry-link">{t('lut.openGuide')}<ArrowRightOutlined /></span></div>
        </button>
      </div>
    </> : !mobile && <div className="lut-detail-head">
      <button type="button" className="lut-back" disabled={isBlocked} onClick={back}><ArrowLeftOutlined />{t('nav.back')}</button>
      <h2 ref={header} tabIndex="-1">{subTitle}</h2>
    </div>}
    {transferOpen && <div hidden={view.page !== 'transfer'}>
      <LutTransfer connected={connected} supported={supported} locked={!!locked} progress={feed}
        onUpload={upload} onSave={mobile ? onSaveVlt : device?.api?.saveVlt}
        onConnect={connect} onGuide={openGuide} onPendingChange={setTransferPending} />
    </div>}
    {view.page === 'guide' && <LutGuide initialRoute={view.route} />}

    <Modal open={active && dialog.open} centered width={420} footer={null} onCancel={closeDialog} afterClose={refocusAfterDialog}
      title={<>
        <span aria-hidden="true" className={'lut-dialog-icon' + (dialog.kind === 'restore' ? ' is-restore' : '')}>{dialog.kind === 'restore' ? <PoweroffOutlined /> : <CheckOutlined />}</span>
        <span className="lut-dialog-title">{t(dialog.kind === 'restore' ? 'lut.restoreConfirmTitle' : 'lut.success')}</span>
      </>} closable={false} className="lut-dialog" destroyOnHidden>
      <p>{t(dialog.kind === 'restore' ? 'lut.restoreConfirmDesc' : 'lut.successHint')}</p>
      <div className="lut-dialog-actions">{dialog.kind === 'restore' ?
        <><button type="button" className="lut-btn" onClick={closeDialog}>{t('lut.cancel')}</button><button type="button" className="lut-btn is-primary" onClick={() => apply(false)}>{t('lut.restoreConfirmOk')}</button></> :
        <><button type="button" className="lut-btn" onClick={() => openGuide('camera', document.getElementById('btnEnableLut'))}><BookOutlined />{t('lut.guideTitle')}</button><button type="button" className="lut-btn is-primary" onClick={closeDialog}>{t('lut.done')}</button></>}
      </div>
    </Modal>
  </section>;
}
