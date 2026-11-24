export const RATE = 44100;
export const MAX_SECONDS = 3;
export const FADE_OUT_SAMPLES = 64;
export const MIN_GAIN_DB = -24;
export const MAX_GAIN_DB = 12;

function createMonoBuffer(frames, sampleRate, audioApi = globalThis) {
  if (typeof audioApi.AudioBuffer === 'function') {
    return new audioApi.AudioBuffer({ length: frames, numberOfChannels: 1, sampleRate });
  }
  const data = new Float32Array(frames);
  return { length: frames, duration: frames / sampleRate, sampleRate, numberOfChannels: 1, getChannelData: () => data };
}

function quantizeInto(rawSamples, outputChannel, gainDb = 0) {
  const scale = gainDb === 0 ? 1 : 10 ** (gainDb / 20);
  const pcm = new ArrayBuffer(rawSamples.length * 2);
  const view = new DataView(pcm);
  let clipped = false;
  for (let index = 0; index < rawSamples.length; index++) {
    const scaled = rawSamples[index] * scale;
    // Ignore sub-0.01 dB Web Audio sinc resampler overshoot on normalized 0 dBFS files.
    if (scaled > 1.001 || scaled < -1.001) clipped = true;
    const value = Math.max(-1, Math.min(1, scaled));
    const quantized = Math.round(value * (value < 0 ? 32768 : 32767));
    view.setInt16(index * 2, quantized, true);
    // Preview and waveform use the quantized audio that is actually written.
    outputChannel[index] = quantized / 32768;
  }
  return { pcm, clipped };
}

export function applyAudioGain(audio, gainDb = 0, audioApi = globalThis) {
  if (!audio?.rawSamples) return audio;
  const clampedDb = Math.max(MIN_GAIN_DB, Math.min(MAX_GAIN_DB, Number.isFinite(gainDb) ? gainDb : 0));
  const buffer = createMonoBuffer(audio.samples, RATE, audioApi);
  const { pcm, clipped } = quantizeInto(audio.rawSamples, buffer.getChannelData(0), clampedDb);
  return { ...audio, pcm, buffer, gainDb: clampedDb, clipped };
}

// Preserve the original conversion: average every input channel, resample with
// Web Audio, trim to three seconds, apply a micro tail fade-out to avoid hard
// truncation clicks, then quantize explicitly to little-endian s16.
export async function decodeAudio(bytes, filename, audioApi = globalThis) {
  let decoder;
  try {
    const data = bytes instanceof ArrayBuffer ? bytes.slice(0) : new Uint8Array(bytes).buffer;
    decoder = new audioApi.AudioContext();
    const decoded = await decoder.decodeAudioData(data);
    if (!Number.isFinite(decoded.duration) || decoded.duration <= 0) throw new Error('音频为空，请选择有声音的文件。');
    const duration = Math.min(MAX_SECONDS, decoded.duration);
    const frames = Math.max(1, Math.floor(duration * RATE));
    const offline = new audioApi.OfflineAudioContext(1, frames, RATE);
    const inputFrames = Math.min(decoded.length, Math.ceil(duration * decoded.sampleRate));
    const mono = offline.createBuffer(1, inputFrames, decoded.sampleRate);
    const target = mono.getChannelData(0);
    for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
      const source = decoded.getChannelData(channel);
      for (let index = 0; index < target.length; index++) target[index] += source[index] / decoded.numberOfChannels;
    }
    const source = offline.createBufferSource();
    source.buffer = mono;
    source.connect(offline.destination);
    source.start(0, 0, duration);
    const buffer = await offline.startRendering();
    const samples = buffer.getChannelData(0);
    const rawSamples = Float32Array.from(samples);
    if (rawSamples.length >= FADE_OUT_SAMPLES * 2) {
      const fadeStart = rawSamples.length - FADE_OUT_SAMPLES;
      for (let i = 0; i < FADE_OUT_SAMPLES; i++) {
        rawSamples[fadeStart + i] *= (FADE_OUT_SAMPLES - 1 - i) / FADE_OUT_SAMPLES;
      }
    }
    const { pcm, clipped } = quantizeInto(rawSamples, samples, 0);
    return { pcm, buffer, rawSamples, gainDb: 0, clipped, filename, originalDuration: decoded.duration, channels: decoded.numberOfChannels, samples: frames, duration: frames / RATE };
  } finally {
    if (decoder) await decoder.close().catch(() => {});
  }
}
