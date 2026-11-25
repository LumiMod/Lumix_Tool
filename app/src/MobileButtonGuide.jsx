import { useEffect, useState } from 'react';
import cameraBack from './assets/camera/dc-s5-back.webp';
import { useI18n } from './i18n';

function PowerLever({ on }) {
  return <svg className={'guide-dial' + (on ? ' is-on' : '')} viewBox="0 0 106 70" aria-hidden="true">
    <circle className="guide-dial__wheel" cx="32" cy="32" r="23" />
    <circle className="guide-dial__rim" cx="32" cy="32" r="19" />
    <g className="guide-dial__lever">
      <path d="M37 24 L62 27 Q66 28 66 32 Q66 36 62 37 L37 40 Z" />
      <path d="M57 29 L57 35 M60 30 L60 34" className="guide-dial__grip" />
    </g>
    <circle cx="32" cy="32" r="12" className="guide-dial__cap" />
    <text x="73" y="28" className="guide-dial__on">ON</text>
    <text x="66" y="59" className="guide-dial__off">OFF</text>
  </svg>;
}

export default function MobileButtonGuide() {
  const { t } = useI18n();
  const keys = [
    { label: t('guide.keyPlay'), x: '11.94%', y: '35.86%' },
    { label: t('guide.keyAfon'), x: '77.04%', y: '31.82%' },
  ];
  const frames = [
    { title: t('guide.f0.t'), detail: t('guide.f0.d'), duration: 1500 },
    { title: t('guide.f1.t'), detail: t('guide.f1.d'), duration: 2000 },
    { title: t('guide.f2.t'), detail: t('guide.f2.d'), duration: 2400 },
    { title: t('guide.f3.t'), detail: t('guide.f3.d'), duration: 2400 },
  ];

  const [frame, setFrame] = useState(0);
  const reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  useEffect(() => {
    if (reducedMotion) return;
    const timer = setTimeout(() => setFrame(prev => (prev + 1) % frames.length), frames[frame].duration);
    return () => clearTimeout(timer);
  }, [frame, reducedMotion, frames.length]);

  return <div className="white-card button-demo" data-frame={frame} data-hold={frame === 1 || frame === 2}>
    <div className="guide-stage">
      <div className="guide-photo">
        <img src={cameraBack} width="1080" height="792" alt="LUMIX DC-S5" />
        {keys.map(key => <span key={key.label} className="guide-ring" aria-hidden="true"
          style={{ left: key.x, top: key.y }}><span className="guide-label">{key.label}</span></span>)}
      </div>
    </div>
    <div className="guide-motion">
      <div aria-live="polite">
        <strong>{reducedMotion ? t('guide.reduced.t') : frames[frame].title}</strong>
        <p>{reducedMotion ? t('guide.reduced.d') : frames[frame].detail}</p>
      </div>
      <figure><PowerLever on={frame >= 2} /></figure>
    </div>
  </div>;
}
