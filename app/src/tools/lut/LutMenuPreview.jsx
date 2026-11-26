import './LutMenuPreview.css';

const categoryIcons = ['camera', 'movie', 'custom', 'wrench', 'user', 'play'];
const customIcons = ['image', 'af', 'dial', 'monitorPhoto', 'monitorVideo', 'wireless', 'lens'];
const slots = ['Set1', 'Set2', 'Set3', 'Set4'];
const monitorShape = <path fillRule="evenodd" d="M2 7h4l1-3h10l1 3h4v13H2V7Zm3 3v7h14v-7H5Z" />;
const glyphs = {
  camera: <path fillRule="evenodd" d="M2 7h4l1.6-3h8.8L18 7h4v13H2V7Zm10 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" />,
  movie: <><circle cx="8" cy="6" r="3.6" /><circle cx="16" cy="6" r="3.6" /><rect x="7" y="11" width="14" height="9" rx="1" /><path d="M2 11l5 3v3l-5 3z" /></>,
  custom: <path fillRule="evenodd" d="m10 2-.7 2.8-2.1.9-2.6-1.3-2.1 3.5 2.2 2-.3 2.3-2.5 1.6 1.4 3.8 3-.4 1.6 1.6-.3 3 4 1 1.4-2.7 2.3-.5 2.4 1.8 2.7-3-1.6-2.5.7-2.1 2.9-.9-.4-4-3-.5-1.1-2 1-2.8L15.2 2l-1.8 2.3-2.2-.2L10 2Zm2 6a4.2 4.2 0 1 0 0 8.4A4.2 4.2 0 0 0 12 8Z" />,
  wrench: <path d="M21 4a6 6 0 0 0-8.1 7.2L2.2 19.3a2.2 2.2 0 0 0 3 3.1l9.2-10a6 6 0 0 0 7-7.2l-4.6 3-2.4-2z" />,
  user: <><circle cx="12" cy="7.3" r="4.4" /><path d="M2.2 21c.6-5.3 4-8 9.8-8s9.2 2.7 9.8 8z" /></>,
  play: <><path fillRule="evenodd" d="M1 5h22v15H1V5Zm2 2v11h18V7H3Z" /><path d="m9 9 6 3.5L9 16z" /></>,
  image: <><path d="m2 12 9-9v18z" /><path d="M13 5h3v3h-3zm0 5h3v3h-3zm0 5h3v3h-3zm5-7h3v3h-3zm0 5h3v3h-3z" /></>,
  af: <><path fill="none" stroke="currentColor" strokeWidth="1.6" d="M2 8V4h5m10 0h5v4m0 8v4h-5m-10 0H2v-4" /><text x="12" y="15.5" textAnchor="middle" fontSize="10" fontWeight="bold">AF</text></>,
  dial: <><path d="M4 18a8 8 0 0 1 16 0z" /><path fill="none" stroke="currentColor" strokeWidth="1.6" d="M2 14a10.5 10.5 0 0 1 20 0M2 10v4l3-1" /></>,
  monitorPhoto: <>{monitorShape}<path stroke="currentColor" strokeWidth="2" strokeDasharray="2 1.2" d="M23 6v14" /></>,
  monitorVideo: monitorShape,
  wireless: <><path d="M3 15h6v6H3z" /><path fill="none" stroke="currentColor" strokeWidth="1.7" d="M5 11a8 8 0 0 1 8 8M5 7a12 12 0 0 1 12 12M5 3a16 16 0 0 1 16 16" /></>,
  lens: <><circle cx="12" cy="12" r="9.2" fill="none" stroke="currentColor" strokeWidth="1.4" /><circle cx="12" cy="12" r="6.7" fill="none" stroke="currentColor" strokeWidth="1.4" /><circle cx="8" cy="8" r="2" /></>,
  photoStyle: <circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" strokeWidth="4.4" strokeDasharray="4 2.7" />,
  contrast: <><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M12 4a8 8 0 0 1 0 16z" /></>,
  highlights: <path d="M3 3h18v18H3zM5 19q8-4 12-14" fill="none" stroke="currentColor" strokeWidth="1.5" />,
  shadows: <path d="M3 3h18v18H3zM5 19q11 0 12-14" fill="none" stroke="currentColor" strokeWidth="1.5" />,
  color: <><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.5" /><circle cx="12" cy="8" r="2" /><circle cx="8" cy="15" r="2" /><circle cx="16" cy="15" r="2" /></>,
  frame: <rect x="3" y="6" width="18" height="12" fill="none" stroke="currentColor" strokeWidth="1.7" />,
  flash: <><path d="M7.5 2 1 13h4l-3 9 9-13H6z" /><path d="M10 12q6-9 13 0-7 9-13 0z" fill="none" stroke="currentColor" strokeWidth="1.3" /><circle cx="16.5" cy="12" r="2" /></>,
};

function Glyph({ name }) {
  return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">{glyphs[name]}</svg>;
}

function MenuRail({ icons, active }) {
  return <div className="s5-screen__rail">
    {icons.map(icon => <span key={icon} className={icon === active ? 'is-active' : undefined}>
      <Glyph name={icon} />
    </span>)}
  </div>;
}

function MenuRows({ rows, active, values = [] }) {
  return <div className="s5-screen__rows">
    {rows.map((item, index) => <div key={item} className={'s5-screen__row' + (index === active ? ' is-selected' : '')}>
      <span>{item}</span>{values[index] && <span className="s5-screen__value">{values[index]}</span>}
    </div>)}
  </div>;
}

function MenuHeading({ children }) {
  return <div className="s5-screen__heading"><span>{children}</span><i className="s5-screen__battery" /></div>;
}

function PhotoStyle({ label }) {
  return <div className="s5-screen__quick">
    <div className="s5-screen__quick-layout">
      <div className="s5-screen__finder"><span className="s5-screen__target" /><strong>{label}<br />V-Log</strong></div>
      <div className="s5-screen__tiles">
        <b className="is-selected"><Glyph name="photoStyle" />V-Log</b><b>AWB</b><b>ISO</b>
        <b><Glyph name="contrast" /></b><b><Glyph name="highlights" /></b><b><Glyph name="shadows" /></b>
        <b><Glyph name="color" /></b><b>S<br />0</b><b>NR<br />0</b>
        <b><Glyph name="frame" /></b><b>3:2</b><b><Glyph name="flash" /></b>
      </div>
    </div>
    <div className="s5-screen__styles"><span>709L</span><strong>V-Log</strong><span>MY 1</span><span>MY 2</span></div>
  </div>;
}

export default function LutMenuPreview({ step, route, labels }) {
  const inCamera = route === 'camera';
  const activeLut = step === 'monitor' && !inCamera ? 'LOOK01' : 'Vlog_709';
  const assistRows = [labels.read, labels.select, labels.monitor, labels.hdmi];
  const assistValues = [null, activeLut, step === 'monitor' ? 'ON' : 'OFF', 'OFF'];
  const screens = {
    read: [labels.assist, assistRows, 0, assistValues],
    select: [labels.assist, assistRows, 1, assistValues],
    monitor: [labels.assist, assistRows, 2, assistValues],
    card: [labels.read, [labels.card1, labels.card2], 0],
    file: [labels.chooseFile, ['LOOK01', 'LOOK02'], 0],
    save: [labels.saveTo, slots, 0],
    imported: [labels.chooseLut, ['Vlog_709', 'LOOK01', ...slots.slice(1)], 1],
    written: [labels.chooseLut, ['Vlog_709', ...slots], 0],
  };
  const screen = screens[step];
  let content;
  if (step === 'menu') {
    content = <div className="s5-screen__columns">
      <MenuRail icons={categoryIcons} active="custom" />
      <MenuRail icons={customIcons} active="monitorVideo" />
      <div className="s5-screen__main">
        <MenuHeading>{labels.monitorMenu}</MenuHeading>
        <MenuRows rows={[labels.assist, ...labels.nearby]} active={0} values={[null, null, 'OFF', 'OFF', 'OFF']} />
      </div>
    </div>;
  } else if (step === 'confirm') {
    content = <div className="s5-screen__confirm">
      <div><strong>{labels.confirm}</strong>
        <div className="s5-screen__choices"><span className="is-selected">{labels.yes}</span><span>{labels.no}</span></div>
      </div>
    </div>;
  } else if (step === 'style') {
    content = <PhotoStyle label={labels.style} />;
  } else {
    const [heading, rows, active, values] = screen;
    content = <div className="s5-screen__list">
      <MenuHeading>{heading}</MenuHeading>
      <MenuRows rows={rows} active={active} values={values} />
      <span className="s5-screen__back">↶</span>
    </div>;
  }
  return <div className="s5-screen" aria-hidden="true">{content}</div>;
}
