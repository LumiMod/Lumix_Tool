import { useEffect, useState } from 'react';
import { PauseOutlined, PlayCircleOutlined, RedoOutlined } from '@ant-design/icons';
import cameraBack from '../assets/camera/dc-s5-back.webp';


const instructions = [
  { title: '关闭相机电源', detail: '将电源开关拨到 OFF，机背朝向自己。' },
  { title: '同时按住回放键和 AF-ON', detail: '回放键上印有方框内的 ▶，在 LVF 键左侧。AF-ON 在机背右上角。' },
  { title: '保持按住，打开电源', detail: '两键保持按下，把电源开关从 OFF 拨到 ON。' },
];

// Centers of the two switches relative to the supplied rear-view photograph.
const switches = [
  { name: '回放 ▶', left: '11.94%', top: '35.86%' },
  { name: 'AF-ON', left: '77.04%', top: '31.82%' },
];

export default function CameraButtonGuide({ active, children }) {
  const [stage, setStage] = useState(-1);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!active || !playing) return;
    const timer = window.setTimeout(() => {
      if (stage === instructions.length - 1) setPlaying(false);
      else setStage(stage + 1);
    }, 2600);
    return () => window.clearTimeout(timer);
  }, [active, playing, stage]);

  const finished = stage === instructions.length - 1 && !playing;
  const label = playing ? '暂停演示' : finished ? '重播演示' : stage < 0 ? '播放按键演示' : '继续演示';
  function togglePlayback() {
    if (!playing && (stage < 0 || finished)) setStage(0);
    setPlaying(!playing);
  }

  return <section className="camera-instructions" aria-labelledby="camera-gesture-heading">
    <div className="camera-instructions__copy">
      <h3 id="camera-gesture-heading">按住两个按键，再开机</h3>
      <ol className="camera-instructions__list">
        {instructions.map((item, index) => <li key={item.title} aria-current={stage === index ? 'step' : undefined}>
          <strong>{item.title}</strong>
          <p>{item.detail}</p>
        </li>)}
      </ol>
      {children}
    </div>
    <figure className="camera-instructions__figure" data-stage={stage} data-playing={playing && active}>
      <div className="camera-instructions__surface">
        <div className="camera-instructions__photo">
          <img src={cameraBack} alt="DC-S5 机背，取景器左侧是回放键，右上角是 AF-ON 键。" width="1080" height="792" />
          {switches.map(button => <span className="camera-instructions__ring" key={button.name}
            style={{ left: button.left, top: button.top }} aria-hidden="true"><span>{button.name}</span></span>)}
        </div>
      </div>
      <figcaption>
        <span>{stage < 0 ? 'DC-S5 机背' : '演示 · 电源 ' + (stage === 2 ? 'ON' : 'OFF')}</span>
        <button className="camera-instructions__play" type="button" onClick={togglePlayback}>
          {playing ? <PauseOutlined /> : finished ? <RedoOutlined /> : <PlayCircleOutlined />}{label}
        </button>
      </figcaption>
      <span className="camera-instructions__sr" role="status">{stage >= 0 && instructions[stage].title}</span>
    </figure>
  </section>;
}
