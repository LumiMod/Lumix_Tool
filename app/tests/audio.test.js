const { test } = require('node:test');
const assert = require('node:assert/strict');

function audioFixture({ duration = 4.25, fail = false } = {}) {
  const channels = [new Float32Array(204000).fill(.75), new Float32Array(204000).fill(-.25), new Float32Array(204000).fill(.25)];
  const captured = {};
  class AudioContext {
    async decodeAudioData() {
      if (fail) throw new Error('Unsupported audio format');
      return { duration, length: 204000, sampleRate: 48000, numberOfChannels: 3, getChannelData: index => channels[index] };
    }
    async close() { captured.closed = true; }
  }
  class OfflineAudioContext {
    constructor(channelCount, frames, rate) { Object.assign(captured, { channelCount, frames, rate }); }
    createBuffer(channelCount, frames, rate) {
      const mono = new Float32Array(frames);
      Object.assign(captured, { inputFrames: frames, inputRate: rate, mono });
      return { getChannelData: () => mono };
    }
    createBufferSource() { return { connect() {}, start: (...args) => { captured.start = args; } }; }
    async startRendering() {
      const output = new Float32Array(captured.frames);
      output.set([-2, -1, -.5, 0, .5, 1, 2]);
      return { getChannelData: () => output, duration: captured.frames / captured.rate };
    }
  }
  return { captured, api: { AudioContext, OfflineAudioContext } };
}

test('conversion preserves real duration, averages every channel, and caps 44.1 kHz mono output at 3 seconds', async () => {
  const { decodeAudio } = await import('../src/tools/focus-sound/audio.mjs');
  const { api, captured } = audioFixture();
  const audio = await decodeAudio(new Uint8Array([1, 2, 3]), 'long.wav', api);
  assert.equal(audio.originalDuration, 4.25);
  assert.equal(audio.duration, 3);
  assert.equal(audio.channels, 3);
  assert.equal(audio.samples, 132300);
  assert.equal(audio.pcm.byteLength, 264600);
  assert.equal(captured.channelCount, 1);
  assert.equal(captured.rate, 44100);
  assert.equal(captured.inputFrames, 144000);
  assert.equal(captured.inputRate, 48000);
  assert.ok(captured.mono.every(sample => Math.abs(sample - .25) < 1e-6));
  assert.deepEqual(captured.start, [0, 0, 3]);
  assert.equal(captured.closed, true);
});

test('PCM clips to signed 16-bit little endian and preview contains the quantized payload', async () => {
  const { decodeAudio } = await import('../src/tools/focus-sound/audio.mjs');
  const { api } = audioFixture({ duration: .5 });
  const audio = await decodeAudio(new ArrayBuffer(8), 'short.wav', api);
  assert.equal(audio.samples, 22050);
  assert.equal(audio.duration, .5);
  assert.deepEqual([...new Uint8Array(audio.pcm).slice(0, 14)], [0, 128, 0, 128, 0, 192, 0, 0, 0, 64, 255, 127, 255, 127]);
  const view = new DataView(audio.pcm);
  for (let index = 0; index < 7; index++) assert.equal(audio.buffer.getChannelData(0)[index], view.getInt16(index * 2, true) / 32768);
});

test('decoder is closed for unsupported or empty audio and errors remain actionable', async () => {
  const { decodeAudio } = await import('../src/tools/focus-sound/audio.mjs');
  const broken = audioFixture({ fail: true });
  await assert.rejects(decodeAudio(new ArrayBuffer(1), 'bad.wav', broken.api), /Unsupported audio format/);
  assert.equal(broken.captured.closed, true);
  const empty = audioFixture({ duration: 0 });
  await assert.rejects(decodeAudio(new ArrayBuffer(1), 'empty.wav', empty.api), /音频为空/);
  assert.equal(empty.captured.closed, true);
});

test('tail fade-out zeroes final sample on non-zero endings and applyAudioGain rescales and unclips', async () => {
  const { decodeAudio, applyAudioGain, FADE_OUT_SAMPLES } = await import('../src/tools/focus-sound/audio.mjs');
  const constantApi = {
    AudioContext: class {
      async decodeAudioData() {
        return { duration: 0.1, length: 4410, sampleRate: 44100, numberOfChannels: 1, getChannelData: () => new Float32Array(4410).fill(1.2) };
      }
      async close() {}
    },
    OfflineAudioContext: class {
      constructor(_ch, frames, rate) { this.frames = frames; this.rate = rate; }
      createBuffer(_ch, frames) { const d = new Float32Array(frames); return { getChannelData: () => d }; }
      createBufferSource() { return { connect() {}, start() {} }; }
      async startRendering() {
        const out = new Float32Array(this.frames).fill(1.25);
        return { getChannelData: () => out, duration: this.frames / this.rate };
      }
    },
  };
  const decoded = await decodeAudio(new ArrayBuffer(8), 'hot.wav', constantApi);
  assert.equal(decoded.clipped, true);
  const view0 = new DataView(decoded.pcm);
  assert.equal(view0.getInt16(0, true), 32767);
  // Final sample after micro fade-out must be exact 0 to avoid step jump into DMA silence guard.
  assert.equal(view0.getInt16((decoded.samples - 1) * 2, true), 0);
  assert.ok(view0.getInt16((decoded.samples - Math.floor(FADE_OUT_SAMPLES / 2)) * 2, true) < 32767);

  // Lowering by -6 dB (~0.501x) recovers unclipped headroom from rawSamples (1.25 * 0.501 ≈ 0.626).
  const quieter = applyAudioGain(decoded, -6, constantApi);
  assert.equal(quieter.clipped, false);
  assert.equal(quieter.gainDb, -6);
  const viewQuiet = new DataView(quieter.pcm);
  const sample0 = viewQuiet.getInt16(0, true);
  assert.ok(sample0 > 19000 && sample0 < 22000, `expected ~20525, got ${sample0}`);
  assert.equal(viewQuiet.getInt16((quieter.samples - 1) * 2, true), 0);
});
