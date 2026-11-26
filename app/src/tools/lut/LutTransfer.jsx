import { useId, useRef, useState } from 'react';
import {
  CameraOutlined, CheckCircleFilled, CloudUploadOutlined, DownloadOutlined, FileOutlined,
  LoadingOutlined, RightOutlined, UploadOutlined, WarningOutlined,
} from '@ant-design/icons';
import { useI18n } from '../../i18n';
import {
  buildPresetVlt, convertFileToVlt, encodeLutToBeef, parseCubeText, parseVltText,
} from './vltConverter.mjs';
import { transferCopy } from './transferCopy';
import './LutTransfer.css';

const PRESETS = [
  { id: 'cinewarm', name: 'CINEWARM.VLT' },
  { id: 'bw', name: 'BWHC.VLT' },
];
const SLOTS = ['Vlog_709', 'SET1', 'SET2', 'SET3', 'SET4'];

async function prepareLut(source, encodeForCamera, convertCardFile) {
  const preset = source.preset && buildPresetVlt(source.preset);
  if (preset && !encodeForCamera) return preset;
  const text = preset ? preset.content : (source.text ?? await source.file.text());
  if (!encodeForCamera) return convertCardFile(text, source.name);
  const lut = /\.vlt$/i.test(source.name) ? parseVltText(text) : parseCubeText(text);
  return encodeForCamera(lut);
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

// The SD-only entry shares the file, preset and export workflow without the camera encoder.
export function LutCardExport({ onPickFile, onSave, onGuide, onPendingChange, convertCardFile, sizeHint }) {
  return <LutTransferForm {...{ onPickFile, onSave, onGuide, onPendingChange, convertCardFile, sizeHint }} />;
}

export default function LutTransfer({ onUpload, ...props }) {
  const writeToCamera = onUpload && ((slot, bytes) => onUpload({
    slot,
    beefBase64: btoa(String.fromCharCode(...bytes)),
  }));
  return <LutTransferForm {...props} encodeForCamera={encodeLutToBeef} onWrite={writeToCamera} />;
}

function LutTransferForm({ connected, supported, locked, progress, onWrite, onPickFile, onSave, onConnect, onGuide, onPendingChange, encodeForCamera, convertCardFile = convertFileToVlt, sizeHint }) {
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
  const camera = !!encodeForCamera && destination === 'camera';
  const cameraReady = connected && supported && !!onWrite;
  const busy = !!stage;
  const writeProgress = stage === 'writing' && progress?.phase === 'lut-upload' && progress.total > 0 && Number.isFinite(progress.done)
    ? Math.max(0, Math.min(100, Math.round(progress.done / progress.total * 100)))
    : null;

  function selectSource(next) {
    if (!next || !/\.(cube|vlt)$/i.test(next.name)) {
      setSource(null);
      setResult({ errorKey: 'invalidType' });
      return;
    }
    setSource(next);
    setResult(null);
  }

  function pickFiles(files) {
    if (!files?.length || inFlight.current || onPickFile) return;
    selectSource(files.length === 1 ? { file: files[0], name: files[0].name } : null);
  }

  async function chooseFile() {
    if (inFlight.current) return;
    if (!onPickFile) {
      fileInput.current?.click();
      return;
    }
    inFlight.current = true;
    onPendingChange?.(true);
    setStage('picking');
    try {
      const file = await onPickFile();
      if (file) selectSource(file);
    } catch (err) {
      setResult({ errorKey: 'failed', detail: err?.message || String(err) });
    } finally {
      setStage(null);
      inFlight.current = false;
      onPendingChange?.(false);
    }
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
        prepared = await prepareLut(source, camera && encodeForCamera, convertCardFile);
      } catch {
        setResult({ errorKey: 'invalidFile' });
        return;
      }
      setStage(camera ? 'writing' : 'saving');
      const response = camera
        ? await onWrite(slot, prepared)
        : await (onSave || downloadVlt)(prepared.filename, prepared.content);
      if (response?.canceled) return;
      if (!response?.ok) {
        setResult({ errorKey: 'failed', detail: response?.error });
        return;
      }
      if (camera) {
        setResult({ route: 'camera', slotName: SLOTS[slot], filename: source.name });
      } else {
        const filename = (!encodeForCamera && response.filename) || response.path?.split(/[\\/]/).pop() || prepared.filename;
        setResult({ route: 'card', filename, download: response.download });
      }
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
        {encodeForCamera && <span><b>Beta</b>{copy.beta}</span>}<span><CameraOutlined aria-hidden="true" /> {copy.photos}</span>
      </div>
      <div className="lut-transfer__body">
        <section className="lut-transfer__source">
          <h3>{copy.source}</h3>
          {!onPickFile && <input
            ref={fileInput} type="file" accept=".cube,.vlt,.CUBE,.VLT" hidden
            onChange={event => { pickFiles(event.target.files); event.target.value = ''; }}
          />}
          <button
            type="button" disabled={busy} onClick={chooseFile}
            className={'lut-transfer__drop' + (dragging ? ' is-dragging' : '')}
            onDragOver={event => { event.preventDefault(); if (!busy && !onPickFile) setDragging(true); }}
            onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false); }}
            onDrop={event => { event.preventDefault(); setDragging(false); pickFiles(event.dataTransfer.files); }}
          >
            <span className="lut-transfer__file-icon" aria-hidden="true">{source ? <FileOutlined /> : <CloudUploadOutlined />}</span>
            <span className="lut-transfer__file-text">
              <strong>{source?.name || copy.choose}</strong>
              <small>{source ? copy.ready : copy.formats}{sizeHint && ' · ' + sizeHint}</small>
            </span>
            <span className="lut-transfer__choose">{source ? copy.replace : <UploadOutlined aria-hidden="true" />}</span>
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
        {encodeForCamera ? <fieldset className="lut-transfer__destinations" disabled={busy}>
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
        </fieldset> : <p className="lut-transfer__card-hint">{copy.cardHint}</p>}
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
                {busy ? <LoadingOutlined aria-hidden="true" /> : camera ? <UploadOutlined aria-hidden="true" /> : <DownloadOutlined aria-hidden="true" />}
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
            <WarningOutlined aria-hidden="true" /><div><strong>{copy[result.errorKey]}</strong>{result.detail && <p>{result.detail}</p>}</div>
          </div>
        )}
        {result?.route && (
          <div className="lut-transfer__result" role="status">
            <CheckCircleFilled aria-hidden="true" />
            <div>
              <strong>{result.route === 'camera' ? copy.written(result.slotName) : copy[result.download ? 'downloaded' : 'saved']}</strong>
              <small>{result.filename}</small>
              <p>{result.route === 'camera' ? copy.writtenHint : copy.savedHint}</p>
              <button type="button" className="lut-transfer__guide" onClick={() => onGuide(result.route)}>
                {copy.guide}<RightOutlined aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
