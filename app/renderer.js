const $ = (s) => document.querySelector(s);
const TARGET_RATE = 44100;
const MAX_SECONDS = 3.0;

const state = {
  connected: false,
  file: null,
  buffer: null,      // decoded AudioBuffer
  pcm: null,         // Int16Array
  samples: 0,
  busy: false,
};

function markStep(n) {
  const el = document.querySelector(`.steps li[data-step="${n}"]`);
  if (el) el.classList.add('done');
}

function setPill(kind, text) {
  const pill = $('#pill');
  pill.className = 'pill ' + (kind === 'ok' ? 'pill-ok' : kind === 'bad' ? 'pill-bad' : 'pill-idle');
  pill.textContent = text;
}

function showResult(ok, text) {
  const el = $('#result');
  el.className = 'result ' + (ok ? 'ok' : 'bad');
  el.textContent = text;
  el.classList.remove('hidden');
}

function hideResult() { $('#result').classList.add('hidden'); }

async function refreshStatus() {
  hideResult();
  try {
    const st = await window.api.status();
    state.connected = !!st.connected;
    if (st.connected) {
      setPill('ok', '已连接');
      markStep(2); markStep(3);
      $('#fileMeta').textContent = st.error
        ? '连接异常：' + st.error
        : `机身 ${st.body_version} · 对焦音${st.custom ? '已自定义' : '原厂'}`;
    } else {
      setPill('bad', '未连接');
      $('#fileMeta').textContent = '相机未在服务模式';
    }
  } catch (e) {
    setPill('bad', '未连接');
    $('#fileMeta').textContent = String(e.message || e);
  }
}

async function loadFile(path) {
  const ab = await window.api.readFile(path);
  const ctx = new AudioContext();
  let buf;
  try {
    buf = await ctx.decodeAudioData(ab.slice(0));
  } catch (e) {
    showResult(false, '无法解码这个音频文件，换一个格式试试。');
    return;
  }
  state.buffer = buf;
  state.file = path;

  const dur = buf.duration;
  let useDur = dur;
  let note = '';
  if (dur > MAX_SECONDS) {
    useDur = MAX_SECONDS;
    note = `音频 ${dur.toFixed(2)} 秒，超过 ${MAX_SECONDS} 秒上限，将只取前 ${MAX_SECONDS} 秒。`;
  }
  $('#trimNote').textContent = note;
  $('#fileName').textContent = path.split(/[\\/]/).pop();
  $('#fileDur').textContent = `${dur.toFixed(2)} 秒 · ${buf.numberOfChannels} 声道 · ${buf.sampleRate} Hz`;
  $('#previewBox').classList.remove('hidden');
  markStep(4);

  // resample to 44100 mono
  const frames = Math.max(1, Math.floor(useDur * TARGET_RATE));
  const off = new OfflineAudioContext(1, frames, TARGET_RATE);
  const src = off.createBufferSource();
  src.buffer = buf;
  src.connect(off.destination);
  src.start(0, 0, useDur);
  const rendered = await off.startRendering();
  const ch = rendered.getChannelData(0);
  const pcm = new Int16Array(ch.length);
  for (let i = 0; i < ch.length; i++) {
    const v = Math.max(-1, Math.min(1, ch[i]));
    pcm[i] = v < 0 ? Math.round(v * 32768) : Math.round(v * 32767);
  }
  state.pcm = pcm;
  state.samples = pcm.length;
  $('#btnApply').disabled = pcm.length === 0;
  const seconds = (pcm.length / TARGET_RATE).toFixed(2);
  const writes = Math.round(pcm.length);
  $('#fileMeta').textContent = `已就绪：${seconds} 秒 · ${pcm.length} 采样 · 约 ${Math.round(writes * 0.002)} 秒写入`;
}

async function pickFile() {
  const p = await window.api.pickAudio();
  if (p) await loadFile(p);
}

async function apply() {
  if (!state.pcm || state.busy) return;
  state.busy = true;
  $('#btnApply').disabled = true;
  hideResult();
  $('#progressWrap').classList.remove('hidden');
  $('#progressBar').style.width = '0%';
  $('#progressText').textContent = '准备写入…';
  try {
    const res = await window.api.apply(state.pcm.buffer, state.samples);
    if (res.ok) {
      markStep(5);
      showResult(true, '写入成功。请按电源键关机再开机（不要拔电池），然后半按快门试听对焦音。');
    } else {
      showResult(false, '写入失败：' + (res.error || JSON.stringify(res)));
    }
  } catch (e) {
    showResult(false, '写入出错：' + (e.message || e));
  } finally {
    state.busy = false;
    $('#btnApply').disabled = !state.pcm;
    $('#progressText').textContent = '完成';
  }
}

async function restore() {
  if (state.busy) return;
  state.busy = true;
  try {
    const res = await window.api.restore();
    showResult(!!res.ok, res.ok ? '已恢复原厂对焦音。重启后生效。' : '恢复失败：' + JSON.stringify(res));
  } catch (e) {
    showResult(false, '恢复出错：' + (e.message || e));
  } finally {
    state.busy = false;
  }
}

async function init() {
  const env = await window.api.env();
  $('#pyPath').textContent = env.python || '未找到 Python 3';
  if (!env.python) {
    showResult(false, '没有找到 Python 3。点下方「更换」选择 python.exe。');
  }

  $('#btnRefresh').addEventListener('click', refreshStatus);
  $('#btnPick').addEventListener('click', pickFile);
  $('#btnApply').addEventListener('click', apply);
  $('#btnRestore').addEventListener('click', restore);

  $('#btnPython').addEventListener('click', async () => {
    const r = await window.api.pickPython();
    if (r && r.ok) {
      $('#pyPath').textContent = r.python;
      showResult(true, 'Python 路径已保存。');
    } else if (r) {
      showResult(false, '这个文件不是可用的 Python 3。');
    }
  });

  window.api.onProgress(({ done, total }) => {
    const pct = Math.min(100, Math.round((done / total) * 100));
    $('#progressBar').style.width = pct + '%';
    $('#progressText').textContent = `写入中 ${done} / ${total} 采样（${pct}%）`;
  });

  const drop = $('#drop');
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => {
    e.preventDefault(); drop.classList.add('hover');
  }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => {
    e.preventDefault(); drop.classList.remove('hover');
  }));
  drop.addEventListener('drop', async (e) => {
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (!f) return;
    const p = window.api.pathForFile ? window.api.pathForFile(f) : f.path;
    if (p) await loadFile(p);
    else showResult(false, '无法读取拖入文件的路径，请用「选择文件」。');
  });

  await refreshStatus();
}

init();
