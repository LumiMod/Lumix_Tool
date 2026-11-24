import { useEffect, useState } from 'react';
import cameraBack from './assets/camera/dc-s5-back.webp';

const keys = [
  { label: '回放 ▶', x: '11.94%', y: '35.86%' },
  { label: 'AF-ON', x: '77.04%', y: '31.82%' },
];
const frames = [
  { title: '先将相机关机', detail: '找到机背的回放键和 AF-ON 键。', duration: 1400 },
  { title: '同时按住两个键', detail: '两根手指一起按下，先别松手。', duration: 1900 },
  { title: '保持按住，再拨到 ON', detail: '两键继续按着，同时拨动机顶的电源开关。', duration: 2300 },
  { title: '开机后松开双键', detail: '用 OTG 数据线连接手机，再点「连接相机」。' },
];

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
  const [frame, setFrame] = useState(0);
  const reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  useEffect(() => {
    if (reducedMotion || frame === frames.length - 1) return;
    const timer = setTimeout(() => setFrame(frame + 1), frames[frame].duration);
    return () => clearTimeout(timer);
  }, [frame, reducedMotion]);

  return <div className="white-card button-demo" data-frame={frame} data-hold={frame === 1 || frame === 2}>
    <div className="guide-stage">
      <div className="guide-photo">
        <img src={cameraBack} width="1080" height="792" alt="DC-S5 机背：回放键在 LVF 键左侧，AF-ON 在机背右上方。" />
        {keys.map(key => <span key={key.label} className="guide-ring" aria-hidden="true"
          style={{ left: key.x, top: key.y }}><span className="guide-label">{key.label}</span></span>)}
      </div>
    </div>
    <div className="guide-motion">
      <div aria-live="polite">
        <strong>{reducedMotion ? '同时按住两键，再拨到 ON' : frames[frame].title}</strong>
        <p>{reducedMotion ? '相机先关机。按住回放与 AF-ON 不放，拨到 ON 后松手，再连接 OTG 数据线。' : frames[frame].detail}</p>
      </div>
      <figure><PowerLever on={frame >= 2} /></figure>
    </div>
  </div>;
}
