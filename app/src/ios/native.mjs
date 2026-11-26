import { registerPlugin } from '@capacitor/core';

const native = registerPlugin('LumixIOS');

export async function pickLutFile() {
  const file = await native.pickLutFile();
  return file.canceled ? null : file;
}

export function saveVlt(filename, content) {
  return native.saveVlt({ filename, content });
}

export function discoverCameras() {
  return native.discoverCameras();
}
