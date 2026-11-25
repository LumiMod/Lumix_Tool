import { useId, useState } from 'react';
import { CheckOutlined, CloudSyncOutlined, CodeOutlined, ExportOutlined, FolderOpenOutlined, GlobalOutlined, LoadingOutlined } from '@ant-design/icons';
import { LANGUAGES, useI18n } from '../i18n';
import { settingsCopy } from './settingsCopy';
import SupportCard from './SupportCard';
import './Settings.css';

export default function Settings({ device, mobile = false, onOpenRepository }) {
  const { lang, setLang, t } = useI18n();
  const copy = settingsCopy[lang];
  const languageGroup = useId();
  const [feedback, setFeedback] = useState(null);
  const [linkError, setLinkError] = useState(null);
  const env = device?.env;
  const appVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.4.0';

  async function choosePython() {
    setFeedback(null);
    const result = await device.pickPython();
    if (result && !result.canceled) setFeedback(result);
  }

  async function openRepository(source) {
    setLinkError(null);
    try {
      const result = onOpenRepository ? await onOpenRepository() : await device.api.openGithub();
      if (result?.ok === false) setLinkError({ source, message: result.error || t('support.error') });
    } catch (error) {
      setLinkError({ source, message: error.message || t('support.error') });
    }
  }

  const about = [
    [t('settings.versionLabel'), `v${appVersion}`],
    [t('settings.supportCamera'), copy.supported],
    [t('settings.runMode'), t(mobile ? 'settings.runModeAndroid' : env?.mock ? 'settings.runModeMock' : 'settings.runModeLocal')],
  ];
  if (!mobile) about.push(
    [t('settings.platform'), 'Windows · WinUSB'],
    [t('settings.theme'), t('settings.themeVal')],
    [t('settings.dataDir'), env?.userData || '…'],
  );

  return <section className="prefs">
    {!mobile && <h2 className="prefs__title">{t('settings.title')}</h2>}
    <div className="prefs__columns">
      <div className="prefs__group">
        <section className="prefs__panel">
          <header><GlobalOutlined aria-hidden="true" /><h3>{copy.language}</h3></header>
          <div id="settingsLang" className="prefs__languages" role="radiogroup" aria-label={copy.language}>
            {LANGUAGES.map(item => <label key={item.code} lang={item.code}>
              <input type="radio" name={languageGroup} checked={lang === item.code} onChange={() => setLang(item.code)} />
              <span>{item.label}{lang === item.code && <CheckOutlined aria-hidden="true" />}</span>
            </label>)}
          </div>
          <p className="prefs__hint">{t('settings.langDesc')}</p>
        </section>

        {!mobile && <section className="prefs__panel">
          <header><CodeOutlined aria-hidden="true" /><h3>{t('settings.pythonTitle')}</h3>
            <span className="prefs__status">{t(env?.mock ? 'settings.pythonMock' : env?.python ? 'settings.pythonOk' : 'settings.pythonUnset')}</span>
          </header>
          <p>{t('settings.pythonDesc')}</p>
          <label className="prefs__field-label" htmlFor="pythonPath">{t('settings.pythonPath')}</label>
          <div className="prefs__path">
            <input id="pythonPath" readOnly value={env?.python || t('settings.pythonNotFound')} />
            <button id="pickPython" type="button" className="prefs__button" disabled={device.locked || env?.mock || device.configuring} onClick={choosePython}>
              {device.configuring && !env?.mock ? <LoadingOutlined /> : <FolderOpenOutlined />}{copy.choose}
            </button>
          </div>
          <p className="prefs__hint">{t('settings.pythonHint')}</p>
          {feedback && <p id="settingsFeedback" className={'prefs__feedback' + (feedback.ok ? '' : ' is-error')} role={feedback.ok ? 'status' : 'alert'}>
            {feedback.ok ? t('settings.pythonSaved') : feedback.error}
          </p>}
        </section>}

        <section className="prefs__panel">
          <header><CloudSyncOutlined aria-hidden="true" /><h3>{copy.updates}</h3></header>
          <div className="prefs__update"><strong>{t('settings.otaTitle')}</strong><span className="prefs__status">{t('settings.otaTag')}</span></div>
          <p>{copy.release}</p>
          <button className="prefs__button" type="button" onClick={() => openRepository('update')}>{copy.repository} <ExportOutlined aria-hidden="true" /></button>
          {linkError?.source === 'update' && <p className="prefs__feedback is-error" role="alert">{linkError.message}</p>}
        </section>
      </div>

      <div className="prefs__group">
        <section className="prefs__panel">
          <header><h3>{t('settings.aboutTitle')}</h3></header>
          <dl className="prefs__details">
            {about.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
          </dl>
        </section>
        <div>
          <SupportCard id={mobile ? 'btnMobileSettingsStar' : 'btnSettingsStar'} onOpen={() => openRepository('star')} />
          {linkError?.source === 'star' && <p className="prefs__feedback is-error" role="alert">{linkError.message}</p>}
        </div>
      </div>
    </div>
  </section>;
}