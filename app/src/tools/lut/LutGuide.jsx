import { useId, useState } from 'react';
import { CameraOutlined, FolderOpenOutlined, LeftOutlined, RightOutlined, RedoOutlined } from '@ant-design/icons';
import { useI18n } from '../../i18n';
import { guideMessages } from './lutGuideMessages';
import menuPhoto from './guide-photos/menu.jpg';
import cardPhoto from './guide-photos/card.jpg';
import filePhoto from './guide-photos/file.jpg';
import savePhoto from './guide-photos/save.jpg';
import confirmPhoto from './guide-photos/confirm.jpg';
import selectPhoto from './guide-photos/select.jpg';
import slotsPhoto from './guide-photos/slots.jpg';
import monitorPhoto from './guide-photos/monitor.jpg';
import stylePhoto from './guide-photos/photo-style.jpg';
import './LutGuide.css';

const routes = {
  card: ['menu', 'card', 'file', 'save', 'confirm', 'select', 'imported', 'monitor', 'style'],
  camera: ['menu', 'select', 'written', 'monitor', 'style'],
};

// The originals are all 1707 × 1280. Frame each LCD without redrawing the menu.
const slotDetail = { src: slotsPhoto, left: 453, top: 269, width: 1065 };
const photos = {
  menu: { src: menuPhoto, left: 220, top: 395, width: 1190 },
  card: { src: cardPhoto, left: 279, top: 335, width: 1170 },
  file: { src: filePhoto, left: 296, top: 358, width: 1146 },
  save: { src: savePhoto, left: 256, top: 359, width: 1075 },
  confirm: { src: confirmPhoto, left: 278, top: 271, width: 1060 },
  select: { src: selectPhoto, left: 405, top: 326, width: 1136 },
  imported: slotDetail,
  written: slotDetail,
  monitor: { src: monitorPhoto, left: 569, top: 410, width: 906 },
  style: { src: stylePhoto, left: 411, top: 339, width: 1042 },
};

export default function LutGuide({ initialRoute = 'card' }) {
  const { lang } = useI18n();
  const copy = guideMessages[lang] ?? guideMessages.zh;
  const [route, setRoute] = useState(initialRoute === 'camera' ? 'camera' : 'card');
  const [step, setStep] = useState(0);
  const headingId = useId();
  const steps = routes[route];
  const current = steps[step];
  const photo = photos[current];
  const [title, instruction] = copy.steps[current];
  const last = step === steps.length - 1;

  function chooseRoute(nextRoute) {
    if (nextRoute === route) return;
    setRoute(nextRoute);
    setStep(0);
  }

  return (
    <div className="s5-guide">
      <div className="s5-guide__sources" role="group" aria-label={copy.routes}>
        <button type="button" aria-pressed={route === 'card'} onClick={() => chooseRoute('card')}>
          <FolderOpenOutlined /> {copy.card}
        </button>
        <button type="button" aria-pressed={route === 'camera'} onClick={() => chooseRoute('camera')}>
          <CameraOutlined /> {copy.camera}
        </button>
      </div>
      <p className="s5-guide__prep">{route === 'card' ? copy.cardPrep : copy.cameraPrep}</p>

      <div className="s5-guide__spread">
        <nav className="s5-guide__index" aria-label={copy.index}>
          <h3>{copy.index}</h3>
          <ol>
            {steps.map((key, index) => (
              <li key={key}>
                <button type="button" aria-current={step === index ? 'step' : undefined} onClick={() => setStep(index)}>
                  <span className="s5-guide__number">{String(index + 1).padStart(2, '0')}</span>
                  {copy.steps[key][0]}
                </button>
              </li>
            ))}
          </ol>
        </nav>
        <div className="s5-guide__reader">
          <label className="s5-guide__jump">
            <span>{copy.index}</span>
            <select value={step} onChange={event => setStep(Number(event.target.value))}>
              {steps.map((key, index) => (
                <option key={key} value={index}>{index + 1} · {copy.steps[key][0]}</option>
              ))}
            </select>
          </label>
          <figure className="s5-guide__figure" aria-labelledby={headingId}>
            <figcaption className="s5-guide__caption" aria-live="polite" aria-atomic="true">
              <div className="s5-guide__counter">{String(step + 1).padStart(2, '0')} / {String(steps.length).padStart(2, '0')}</div>
              <h3 id={headingId}>{title}</h3>
              <p>{instruction}</p>
            </figcaption>
            <div className="s5-guide__screen">
              <img
                src={photo.src}
                alt={title}
                style={{
                  width: `${1707 / photo.width * 100}%`,
                  transform: `translate(${-photo.left / 1707 * 100}%, ${-photo.top / 1280 * 100}%)`,
                }}
              />
            </div>
          </figure>
          <div className="s5-guide__paging">
            <button type="button" disabled={step === 0} onClick={() => setStep(step - 1)}>
              <LeftOutlined /> {copy.previous}
            </button>
            <button type="button" onClick={() => setStep(last ? 0 : step + 1)}>
              {last ? <>{copy.restart} <RedoOutlined /></> : <>{copy.next} <RightOutlined /></>}
            </button>
          </div>
        </div>
      </div>
      <aside className="s5-guide__note">
        <strong>{copy.noteTitle}</strong>
        <p>{copy.note}</p>
      </aside>
      <p className="s5-guide__source">{copy.source}</p>
    </div>
  );
}
