const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  env: () => ipcRenderer.invoke('env'),
  pickPython: () => ipcRenderer.invoke('pick-python'),
  pickAudio: () => ipcRenderer.invoke('pick-audio'),
  status: () => ipcRenderer.invoke('status'),
  readFile: (p) => ipcRenderer.invoke('read-file', p),
  apply: (pcm, samples) => ipcRenderer.invoke('apply', { pcm, samples }),
  restore: () => ipcRenderer.invoke('restore'),
  onProgress: (cb) => ipcRenderer.on('progress', (_e, p) => cb(p)),
});
