import { useId, useRef, useState } from 'react';
import {
  CameraOutlined, CheckCircleFilled, CloudUploadOutlined, DownloadOutlined, FileOutlined,
  LoadingOutlined, RightOutlined, UploadOutlined, WarningOutlined,
} from '@ant-design/icons';
import { useI18n } from '../../i18n';
import {
  buildPresetVlt, convertCubeToVlt, encodeLutToBeef, parseCubeText, parseVltText,
} from './vltConverter.mjs';
import { transferCopy } from './transferCopy';
import './LutTransfer.css';

const PRESETS = [
  { id: 'cinewarm', name: 'CINEWARM.VLT' },
  { id: 'bw', name: 'BWHC.VLT' },
];
const SLOTS = ['Vlog_709', 'SET1', 'SET2', 'SET3', 'SET4'];

async function prepareLut(source, camera) {
  const preset = source.preset && buildPresetVlt(source.preset);
  if (preset && !camera) return preset;
  const text = preset ? preset.content : await source.file.text();
  const isVlt = /\.vlt$/i.test(source.name);
  if (!camera && !isVlt) return convertCubeToVlt(text, source.name);
  const lut = isVlt ? parseVltText(text) : parseCubeText(text);
  if (camera) return btoa(String.fromCharCode(...encodeLutToBeef(lut)));

  // The SD reader needs a 17-point table and a fixed header. VLT inputs can also be 9-point.
  const cube = ['LUT_3D_SIZE ' + lut.size, ...lut.data.map(row => row.join(' '))].join('\n');
  return convertCubeToVlt(cube, source.name);
}

function downloadVlt(filename, content) {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/octet-stream' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { ok: true, download: true };
}

export default function LutTransfer({ connected, supported, locked, progress, onUpload, onSave, onConnect, onGuide, onPendingChange }) {
  const { lang } = useI18n();
  const copy = transferCopy[lang] || transferCopy.zh;
  const [source, setSource] = useState(null);
  const [destination, setDestination] = useState(() => connected && supported ? 'camera' : 'card');
  const [slot, setSlot] = useState(0);
  const [stage, setStage] = useState(null);
  const [result, setResult] = useState(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef(null);
  const inFlight = useRef(false);
  const groupId = useId();
  const camera = destination === 'camera';
  const cameraReady = connected && supported && !!onUpload;
  const busy = !!stage;
  const writeProgress = stage === 'writing' && progress?.phase === 'lut-upload' && progress.total > 0 && Number.isFinite(progress.done)
    ? Math.max(0, Math.min(100, Math.round(progress.done / progress.total * 100)))
    : null;

  function pickFiles(files) {
    if (!files?.length || inFlight.current) return;
    const file = files[0];
    if (files.length !== 1 || !/\.(cube|vlt)$/i.test(file.name)) {
      setSource(null);
      setResult({ errorKey: 'invalidType' });
      return;
    }
    setSource({ file, name: file.name });
    setResult(null);
  }

  async function submit() {
    if (inFlight.current || !source || (camera && (!cameraReady || locked))) return;
    inFlight.current = true;
    onPendingChange?.(true);
    setResult(null);
    setStage('prepare');
    try {
      // Let the interface paint the preparation state before parsing a local table.
      await new Promise(resolve => setTimeout(resolve, 0));
      let prepared;
      try {
        prepared = await prepareLut(source, camera);
      } catch {
        setResult({ errorKey: 'invalidFile' });
        return;
      }
      setStage(camera ? 'writing' : 'saving');
      const response = camera
        ? await onUpload({ slot, beefBase64: prepared })
        : await (onSave || downloadVlt)(prepared.filename, prepared.content);
      if (response?.canceled) return;
      if (!response?.ok) {
        setResult({ errorKey: 'failed', detail: response?.error });
        return;
      }
      setResult(camera
        ? { route: 'camera', slotName: SLOTS[slot], filename: source.name }
        : { route: 'card', filename: response.path?.split(/[\\/]/).pop() || prepared.filename, download: response.download });
    } catch (err) {
      setResult({ errorKey: 'failed', detail: err?.message || String(err) });
    } finally {
      setStage(null);
      inFlight.current = false;
      onPendingChange?.(false);
    }
  }

  return (
    <div className="lut-transfer">
      <div className="lut-transfer__scope">
        <span><b>Beta</b>{copy.beta}</span><span><CameraOutlined /> {copy.photos}</span>
      </div>
      <div className="lut-transfer__body">
        <section className="lut-transfer__source">
          <h3>{copy.source}</h3>
          <input
            ref={fileInput} type="file" accept=".cube,.vlt,.CUBE,.VLT" hidden
            onChange={event => { pickFiles(event.target.files); event.target.value = ''; }}
          />
          <button
            type="button" disabled={busy} onClick={() => fileInput.current?.click()}
            className={'lut-transfer__drop' + (dragging ? ' is-dragging' : '')}
            onDragOver={event => { event.preventDefault(); if (!busy) setDragging(true); }}
            onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false); }}
            onDrop={event => { event.preventDefault(); setDragging(false); pickFiles(event.dataTransfer.files); }}
          >
            <span className="lut-transfer__file-icon">{source ? <FileOutlined /> : <CloudUploadOutlined />}</span>
            <span className="lut-transfer__file-text">
              <strong>{source?.name || copy.choose}</strong>
              <small>{source ? copy.ready : copy.formats}</small>
            </span>
            <span className="lut-transfer__choose">{source ? copy.replace : <UploadOutlined />}</span>
          </button>
          <div className="lut-transfer__presets">
            <span>{copy.presets}</span>
            {PRESETS.map(preset => (
              <button
                key={preset.id} type="button" disabled={busy} aria-pressed={source?.preset === preset.id}
                onClick={() => { setSource({ name: preset.name, preset: preset.id }); setResult(null); }}
              >
                <i aria-hidden="true" className={'lut-transfer__swatch is-' + preset.id} />{copy[preset.id]}
              </button>
            ))}
          </div>
        </section>
        <fieldset className="lut-transfer__destinations" disabled={busy}>
          <legend>{copy.destination}</legend>
          <div className="lut-transfer__options">
            {['camera', 'card'].map(route => (
              <label key={route} className={'lut-transfer__option' + (destination === route ? ' is-selected' : '')}>
                <input
                  type="radio" name={groupId} checked={destination === route}
                  onChange={() => { setDestination(route); setResult(null); }}
                />
                <strong>{copy[route]}</strong>
                <span>{copy[route + 'Hint']}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="lut-transfer__actions">
          {camera && (
            <label className="lut-transfer__slot">
              {copy.slot}
              <select value={slot} disabled={busy} onChange={event => { setSlot(Number(event.target.value)); setResult(null); }}>
                {SLOTS.map((name, index) => <option key={name} value={index}>{name}</option>)}
              </select>
            </label>
          )}
          {camera && !cameraReady
            ? <div className="lut-transfer__connection">
                <span>{connected ? copy.unsupported : copy.disconnected}</span>
                {!connected && <button type="button" id="lut-transfer-connect" className="lut-btn" disabled={busy || locked} onClick={onConnect}>{copy.connect}</button>}
              </div>
            : <button
                type="button" className="lut-btn is-primary lut-transfer__submit" aria-busy={busy}
                disabled={!source || busy || (camera && locked)} onClick={submit}
              >
                {busy ? <LoadingOutlined /> : camera ? <UploadOutlined /> : <DownloadOutlined />}
                {busy ? copy[stage] : camera ? copy.write : copy.save}
                {writeProgress !== null && <span className="lut-transfer__percent">{writeProgress}%</span>}
              </button>}
        </div>
        {busy && (
          <div className="lut-transfer__progress" role="status">
            <div><strong>{copy[stage]}</strong>{writeProgress != null && <b>{writeProgress}%</b>}</div>
            <progress max="100" value={writeProgress ?? undefined} aria-label={copy[stage]} />
            {stage === 'writing' && <small>{copy.keepConnected}</small>}
            {stage === 'saving' && onSave && <small>{copy.saveHint}</small>}
          </div>
        )}
        {result?.errorKey && (
          <div className="lut-transfer__result is-error" role="alert">
            <WarningOutlined /><div><strong>{copy[result.errorKey]}</strong>{result.detail && <p>{result.detail}</p>}</div>
          </div>
        )}
        {result?.route && (
          <div className="lut-transfer__result" role="status">
            <CheckCircleFilled />
            <div>
              <strong>{result.route === 'camera' ? copy.written(result.slotName) : copy[result.download ? 'downloaded' : 'saved']}</strong>
              <small>{result.filename}</small>
              <p>{result.route === 'camera' ? copy.writtenHint : copy.savedHint}</p>
              <button type="button" className="lut-transfer__guide" onClick={() => onGuide(result.route)}>
                {copy.guide}<RightOutlined />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
