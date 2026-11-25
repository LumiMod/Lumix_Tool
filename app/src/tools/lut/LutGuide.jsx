import { useEffect, useState } from 'react';
import { LeftOutlined, PauseOutlined, PlayCircleOutlined, RightOutlined } from '@ant-design/icons';
import { useI18n } from '../../i18n';
import './LutGuide.css';

/* Minimal authentic Panasonic DC-S5 menu icons (SVG) */
function IconCam() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M9 4 7.2 6H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-3.2L15 4H9zm3 13a4 4 0 1 1 0-8 4 4 0 0 1 0 8z"/></svg>;
}
function IconVideo() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17 10.5V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3.5l5 4v-11l-5 4z"/></svg>;
}
function IconCustomGear() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19.4 13a7.7 7.7 0 0 0 0-2l2-1.5-2-3.5-2.3 1a7.4 7.4 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7.4 7.4 0 0 0-1.7 1L6.6 6l-2 3.5 2 1.5a7.7 7.7 0 0 0 0 2l-2 1.5 2 3.5 2.3-1a7.4 7.4 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7.4 7.4 0 0 0 1.7-1l2.3 1 2-3.5-2-1.5zM13 15a3 3 0 1 1 0-6 3 3 0 0 1 0 6z"/></svg>;
}
function IconWrench() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z"/></svg>;
}
function IconPlay() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>;
}
function IconMonitorVideo() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M21 3H3a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5v2h8v-2h5a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm0 14H3V5h18v12zm-11-2 6-4-6-4v8z"/></svg>;
}
function IconImage() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2zM8.5 13.5l2.5 3 3.5-4.5 4.5 6H5l3.5-4.5z"/></svg>;
}
function IconAF() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M4 4h5V2H2v7h2V4zm16 0v5h2V2h-7v2h5zM4 15H2v7h7v-2H4v-5zm16 5h-5v2h7v-7h-2v5zM9 9h6v6H9z"/></svg>;
}

const STEP_COUNT = 3;

export default function LutGuide() {
  const { t } = useI18n();
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (!playing) return undefined;
    const timer = setInterval(() => setStep(prev => (prev + 1) % STEP_COUNT), 4200);
    return () => clearInterval(timer);
  }, [playing]);

  function pick(idx) {
    setStep(idx);
    setPlaying(false);
  }

  const tabs = [t('lut.guide.s2Title'), t('lut.guide.s3Title'), t('lut.guide.s4Title')];
  const captions = [t('lut.guide.cap1'), t('lut.guide.cap2'), t('lut.guide.cap3')];

  return (
    <div className="s5-guide">
      <div className="s5-guide__steps" role="tablist">
        {tabs.map((label, idx) => (
          <button
            key={idx}
            type="button"
            role="tab"
            aria-selected={step === idx}
            className={'s5-guide__step' + (step === idx ? ' is-active' : '')}
            onClick={() => pick(idx)}
          >
            <span className="s5-guide__step-dot">{idx + 1}</span>
            <span>{label}</span>
          </button>
        ))}
      </div>

      <div className="s5-lcd" aria-live="polite">
        <div className="s5-lcd__header">
          <span>LUMIX DC-S5</span>
          <span className="s5-lcd__key">{step === 2 ? 'Q' : 'MENU/SET'}</span>
        </div>

        {(step === 0 || step === 1) && (
          <div className="s5-menu" key={step}>
            {/* Leftmost Main Tab Rail */}
            <div className="s5-rail" aria-hidden="true">
              <div className="s5-rail__ico"><IconCam /></div>
              <div className="s5-rail__ico"><IconVideo /></div>
              <div className="s5-rail__ico is-active is-pulse"><IconCustomGear /></div>
              <div className="s5-rail__ico"><IconWrench /></div>
              <div className="s5-rail__ico"><IconPlay /></div>
            </div>

            {/* Second Sub-Tab Rail under Custom */}
            <div className="s5-rail is-sub" aria-hidden="true">
              <div className="s5-rail__ico"><IconImage /></div>
              <div className="s5-rail__ico"><IconAF /></div>
              <div className="s5-rail__ico is-active is-pulse"><IconMonitorVideo /></div>
            </div>

            {/* Right Item List */}
            <div className="s5-list">
              <div className="s5-list__title">
                <span>{t('lut.guide.menuVA')}</span>
                <span>1/1</span>
              </div>
              {step === 0 ? (
                <>
                  <div className="s5-row is-focus">
                    <span>{t('lut.guide.menuReadLut')}</span>
                    <span className="s5-row__val">▸</span>
                  </div>
                  <div className="s5-subpop">
                    <span>SD1: CINEWARM.VLT</span>
                    <strong>→ SET1</strong>
                  </div>
                  <div className="s5-row">
                    <span>{t('lut.guide.menuSelectLut')}</span>
                    <span className="s5-row__val">Vlog_709</span>
                  </div>
                  <div className="s5-row">
                    <span>{t('lut.guide.menuMonAssist')}</span>
                    <span className="s5-row__val">OFF</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="s5-row">
                    <span>{t('lut.guide.menuReadLut')}</span>
                    <span className="s5-row__val">✓</span>
                  </div>
                  <div className="s5-row is-focus">
                    <span>{t('lut.guide.menuSelectLut')}</span>
                    <span className="s5-row__val">SET1</span>
                  </div>
                  <div className="s5-row is-focus">
                    <span>{t('lut.guide.menuMonAssist')}</span>
                    <span className="s5-row__val s5-row__on">ON</span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="s5-qview" key="qview">
            <div className="s5-qview__scene">
              <div className="s5-qview__hud">
                <span className="s5-hud-pill is-lut">[LUT] V-Log</span>
                <span className="s5-hud-pill">RAW+FINE</span>
              </div>
              <div style={{ textAlign: 'right', fontSize: 10, color: 'rgba(255,255,255,0.85)', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
                V-Log → LUT
              </div>
            </div>
            <div className="s5-qbar">
              <div className="s5-qcell is-focus">
                <span className="s5-qcell__k">{t('lut.guide.qStyle')}</span>
                <span className="s5-qcell__v">V-Log</span>
              </div>
              <div className="s5-qcell is-focus">
                <span className="s5-qcell__k">{t('lut.guide.qQual')}</span>
                <span className="s5-qcell__v">RAW+FINE</span>
              </div>
              <div className="s5-qcell">
                <span className="s5-qcell__k">View Assist</span>
                <span className="s5-qcell__v" style={{ color: '#2ecc71' }}>ON</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="s5-guide__bar">
        <p className="s5-guide__caption">{captions[step]}</p>
        <div className="s5-guide__nav">
          <button type="button" className="s5-guide__iconbtn" aria-label="prev" onClick={() => pick((step + STEP_COUNT - 1) % STEP_COUNT)}>
            <LeftOutlined />
          </button>
          <button type="button" className="s5-guide__iconbtn" aria-label="play" onClick={() => setPlaying(p => !p)}>
            {playing ? <PauseOutlined /> : <PlayCircleOutlined />}
          </button>
          <button type="button" className="s5-guide__iconbtn" aria-label="next" onClick={() => pick((step + 1) % STEP_COUNT)}>
            <RightOutlined />
          </button>
        </div>
      </div>
    </div>
  );
}
