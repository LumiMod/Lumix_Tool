import { useId, useState } from 'react';
import { CameraOutlined, FolderOpenOutlined, LeftOutlined, RightOutlined, RedoOutlined } from '@ant-design/icons';
import { useI18n } from '../../i18n';
import { guideMessages } from './lutGuideMessages';
import LutMenuPreview from './LutMenuPreview';
import './LutGuide.css';

const routes = {
  card: ['menu', 'read', 'card', 'file', 'save', 'confirm', 'select', 'imported', 'monitor', 'style'],
  camera: ['menu', 'select', 'written', 'monitor', 'style'],
};

export default function LutGuide({ initialRoute = 'card' }) {
  const { lang } = useI18n();
  const copy = guideMessages[lang] ?? guideMessages.zh;
  const [route, setRoute] = useState(initialRoute === 'camera' ? 'camera' : 'card');
  const [step, setStep] = useState(0);
  const headingId = useId();
  const steps = routes[route];
  const current = steps[step];
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
              <div className="s5-guide__counter"><span>{String(step + 1).padStart(2, '0')} / {String(steps.length).padStart(2, '0')}</span><span>{copy.preview.label}</span></div>
              <h3 id={headingId}>{title}</h3>
              <p>{instruction}</p>
            </figcaption>
            <LutMenuPreview step={current} route={route} labels={copy.preview} />
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
