import { ArrowRightOutlined, ExpandOutlined, RightOutlined, SoundOutlined, UsbOutlined } from '@ant-design/icons';
import { useI18n } from './i18n';
import cameraFront from './assets/camera/dc-s5-front.webp';

export default function MobileHomeCards({ device, checking, customSounds, openTool }) {
  const { t } = useI18n();
  const connected = !!device?.connected && !device?.error;
  let connectionHint = t('mobile.home.cameraSub');
  if (checking) connectionHint = t('status.checking');
  else if (connected && device?.verified) connectionHint = t('mobile.home.fwLabel') + (device.unlock?.unlocked ? t('mobile.home.unlocked6k') : '');
  else if (connected && device?.body_version) connectionHint = t('mobile.camera.fwBad', { ver: device.body_version });
  else if (connected) connectionHint = t('nav.connection');
  else if (device?.mode === 'ptp') connectionHint = t('status.needService');
  else if (device?.error) connectionHint = t('status.error');

  return <>
    <button type="button" id="tool-camera" className="home-camera" onClick={() => openTool('camera')}>
      <span className="home-camera__copy">
        <span className="home-camera__model"><UsbOutlined /> LUMIX DC-S5</span>
        <strong>{t(connected ? 'mobile.home.cameraConnected' : 'mobile.home.cameraConnect')}</strong>
        <small>{connectionHint}</small>
        <span className="home-camera__arrow" aria-hidden="true"><ArrowRightOutlined /></span>
      </span>
      <span className="home-camera__visual" aria-hidden="true"><img src={cameraFront} alt="" /></span>
    </button>
    <div className="home-tools">
      <h2>{t('nav.tools')}</h2>
      <div className="home-tools__grid">
        <HomeTool id="lut" openTool={openTool} title={t('mobile.home.lutTitle')} subtitle={t('mobile.home.lutSub')}
          badge={device?.lut?.enabled && t('mobile.home.lutBadge')}
          icon={<span className="home-lut-samples"><i /><i /><i /></span>} />
        <HomeTool id="formats" openTool={openTool} title={t('mobile.home.formatsTitle')} subtitle={t('mobile.home.formatsSub')}
          badge={device?.unlock?.unlocked && t('mobile.home.formatsBadge')} icon={<ExpandOutlined />} />
        <HomeTool id="audio" openTool={openTool} title={t('mobile.home.audioTitle')} subtitle={t('mobile.home.audioSub')}
          badge={customSounds > 0 && t('mobile.home.audioBadge', { count: customSounds })} icon={<SoundOutlined />} />
      </div>
    </div>
  </>;
}

function HomeTool({ id, openTool, title, subtitle, badge, icon }) {
  return <button type="button" id={'tool-' + id} className={'home-tool is-' + id} onClick={() => openTool(id)}>
    <span className="home-tool__icon" aria-hidden="true">{icon}</span>
    <span className="home-tool__copy">
      <strong>{title}</strong>
      <small>{subtitle}</small>
      {badge && <span className="home-tool__badge">{badge}</span>}
    </span>
    <RightOutlined className="home-tool__arrow" aria-hidden="true" />
  </button>;
}
