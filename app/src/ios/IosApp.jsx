import { useEffect, useRef, useState } from 'react';
import { DownloadOutlined, LeftOutlined, ReadOutlined, SettingOutlined, UsbOutlined } from '@ant-design/icons';
import { I18nProvider, LANGUAGES, useI18n } from '../i18n';
import LanguagePicker from '../components/LanguagePicker';
import { LutCardExport } from '../tools/lut/LutTransfer';
import LutGuide from '../tools/lut/LutGuide';
import CameraCheck from './CameraCheck';
import { iosMessages } from './iosMessages';
import { pickLutFile, saveVlt } from './native';
import { convertIosFile } from './convertLut';
import '../mobile.css';
import '../tools/lut/LutDirect.css';
import './ios.css';

const sections = [
  { id: 'export', Icon: DownloadOutlined },
  { id: 'guide', Icon: ReadOutlined },
  { id: 'usb', Icon: UsbOutlined },
];

async function fileOperation(promise, copy) {
  try {
    return await promise;
  } catch (error) {
    throw new Error(copy.fileErrors[error?.code] || copy.fileErrors.FILE_IO);
  }
}

function IosWorkspace() {
  const { lang, setLang, t, needsLanguageChoice } = useI18n();
  const copy = iosMessages[lang];
  const [section, setSection] = useState('export');
  const [settings, setSettings] = useState(false);
  const [pending, setPending] = useState(false);
  const [guideVisit, setGuideVisit] = useState(0);
  const title = useRef(null);
  const settingsButton = useRef(null);
  const languageChoice = useRef(null);
  const moveFocus = useRef(null);

  useEffect(() => {
    if (needsLanguageChoice) {
      moveFocus.current = title.current;
      languageChoice.current?.querySelector('button')?.focus();
    } else if (moveFocus.current) {
      moveFocus.current.focus();
      moveFocus.current = null;
    }
  }, [section, settings, needsLanguageChoice]);

  function navigate(next) {
    if (pending || next === section) return;
    moveFocus.current = title.current;
    setSection(next);
    window.scrollTo(0, 0);
  }

  function toggleSettings() {
    if (pending) return;
    moveFocus.current = settings ? settingsButton.current : title.current;
    setSettings(!settings);
    window.scrollTo(0, 0);
  }

  const heading = settings ? t('settings.title')
    : section === 'export' ? copy.exportTitle : section === 'guide' ? t('lut.guideTitle') : copy.usbTitle;

  return <>
    <div className="mobile-shell ios-app" inert={needsLanguageChoice}>
      <header className="ios-bar">
        <div className="wordmark"><span className="brand-tile" aria-hidden="true"><i /></span>Lumix<span>Tool</span></div>
        <button ref={settingsButton} type="button" className="ios-settings-link" onClick={toggleSettings} disabled={pending}>
          {settings ? <LeftOutlined aria-hidden="true" /> : <SettingOutlined aria-hidden="true" />}{t(settings ? 'nav.back' : 'settings.title')}
        </button>
      </header>
      {!settings && <nav className="ios-nav" aria-label={t('nav.tools')}>
        {sections.map(({ id, Icon }) => <button type="button" key={id} aria-current={section === id ? 'page' : undefined}
          disabled={pending && section !== id} onClick={() => navigate(id)}>
          <Icon aria-hidden="true" />{copy[id + 'Tab']}
        </button>)}
      </nav>}
      <main className="lut-studio ios-main">
        <h1 ref={title} tabIndex={-1}>{heading}</h1>
        <section hidden={settings || section !== 'export'}>
          <p className="ios-intro">{copy.exportIntro}</p>
          <LutCardExport onPickFile={() => fileOperation(pickLutFile(), copy)}
            convertCardFile={convertIosFile} sizeHint={copy.importLimit}
            onSave={(name, content) => fileOperation(saveVlt(name, content), copy)} onPendingChange={setPending}
            onGuide={() => { setGuideVisit(n => n + 1); navigate('guide'); }} />
        </section>
        <section hidden={settings || section !== 'guide'}>
          <p className="ios-intro">{copy.guideIntro}</p>
          <LutGuide key={guideVisit} initialRoute="card" />
        </section>
        <section hidden={settings || section !== 'usb'}>
          <p className="ios-intro">{copy.usbIntro}</p>
          <CameraCheck copy={copy} onPendingChange={setPending} />
        </section>
        {settings && <section className="ios-settings">
          <label><span>{t('settings.langTitle')}</span>
            <select value={lang} onChange={e => setLang(e.target.value)}>
              {LANGUAGES.map(item => <option key={item.code} value={item.code}>{item.label}</option>)}
            </select>
          </label>
          <p>{t('settings.langDesc')}</p>
        </section>}
      </main>
    </div>
    <div ref={languageChoice}><LanguagePicker /></div>
  </>;
}

export default function IosApp() {
  return <I18nProvider><IosWorkspace /></I18nProvider>;
}
