const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, spawnSync } = require('child_process');

let win = null;

const CANDIDATE_PYTHONS = [
  process.env.S5_PYTHON,
  'C:\\Users\\28985\\.dsh\\dsh-runtimes\\dsh-next-primary-runtime\\dependencies\\python\\python.exe',
  'python',
  'py',
].filter(Boolean);

function configPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(configPath(), 'utf8')); } catch (e) { return {}; }
}

function saveConfig(cfg) {
  try {
    fs.mkdirSync(path.dirname(configPath()), { recursive: true });
    fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2));
  } catch (e) {}
}

function testPython(exe) {
  const r = spawnSync(exe, ['-c', 'import sys;print(sys.version_info[0])'], { encoding: 'utf8', timeout: 8000 });
  return r.status === 0 && (r.stdout || '').trim().startsWith('3');
}

function findPython() {
  const cfg = loadConfig();
  const list = [cfg.python].concat(CANDIDATE_PYTHONS);
  for (const exe of list) {
    if (!exe) continue;
    if (testPython(exe)) return exe;
  }
  return null;
}

function pythonExe() {
  const p = findPython();
  if (!p) throw new Error('未找到可用的 Python 3，请在设置里指定路径');
  return p;
}

function scriptPath() {
  return path.join(__dirname, 'python', 's5focus.py');
}

function runPython(args, onLine) {
  return new Promise((resolve, reject) => {
    const exe = pythonExe();
    const child = spawn(exe, ['-u', scriptPath()].concat(args), { windowsHide: true });
    let out = '';
    child.stdout.on('data', (d) => {
      const text = d.toString('utf8');
      out += text;
      text.split(/\r?\n/).forEach((line) => {
        if (line.trim() && onLine) onLine(line.trim());
      });
    });
    child.stderr.on('data', (d) => { out += d.toString('utf8'); });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, out }));
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1000,
    height: 780,
    minWidth: 860,
    minHeight: 640,
    backgroundColor: '#0d1117',
    title: 'S5 对焦音效定制器',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.webContents.on('did-fail-load', (e, code, desc) => {
    console.error('PAGE LOAD FAILED', code, desc);
  });
  win.webContents.on('console-message', (e, level, message) => {
    console.log('RENDERER:', level, message);
  });
  win.webContents.on('did-finish-load', () => {
    console.log('PAGE LOADED');
    win.show();
    win.focus();
  });
  win.loadFile(path.join(__dirname, 'index.html'));
  win.on('closed', () => { win = null; });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('env', async () => {
  let py = null;
  try { py = pythonExe(); } catch (e) {}
  return { python: py, platform: process.platform, userData: app.getPath('userData') };
});

ipcMain.handle('pick-python', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: '选择 python.exe',
    properties: ['openFile'],
    filters: [{ name: 'Python', extensions: ['exe'] }],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  const exe = r.filePaths[0];
  if (!testPython(exe)) return { ok: false };
  const cfg = loadConfig();
  cfg.python = exe;
  saveConfig(cfg);
  return { ok: true, python: exe };
});

ipcMain.handle('pick-audio', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: '选择音频文件',
    properties: ['openFile'],
    filters: [{ name: '音频', extensions: ['wav', 'mp3', 'm4a', 'aac', 'flac', 'ogg', 'opus'] }],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  return r.filePaths[0];
});

ipcMain.handle('read-file', async (evt, p) => {
  return fs.readFileSync(p);
});

ipcMain.handle('status', async () => {
  const res = await runPython(['status']);
  const lines = res.out.trim().split(/\r?\n/).filter(Boolean);
  const last = lines.length ? lines[lines.length - 1] : '{}';
  try { return JSON.parse(last); } catch (e) { return { connected: false, error: res.out }; }
});

ipcMain.handle('apply', async (evt, payload) => {
  const tmp = path.join(os.tmpdir(), 's5focus_' + Date.now() + '.pcm');
  fs.writeFileSync(tmp, Buffer.from(payload.pcm));
  try {
    const res = await runPython(['apply', tmp, String(payload.samples)], (line) => {
      if (line.startsWith('PROGRESS')) {
        const parts = line.split(' ');
        if (win) win.webContents.send('progress', { done: Number(parts[1]), total: Number(parts[2]) });
      }
    });
    const lines = res.out.trim().split(/\r?\n/).filter(Boolean);
    const last = lines.length ? lines[lines.length - 1] : '{}';
    try { return JSON.parse(last); } catch (e) { return { ok: false, error: res.out }; }
  } finally {
    try { fs.unlinkSync(tmp); } catch (e) {}
  }
});

ipcMain.handle('restore', async () => {
  const res = await runPython(['restore']);
  const lines = res.out.trim().split(/\r?\n/).filter(Boolean);
  const last = lines.length ? lines[lines.length - 1] : '{}';
  try { return JSON.parse(last); } catch (e) { return { ok: false, error: res.out }; }
});
