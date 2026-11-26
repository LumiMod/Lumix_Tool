import { convertFileToVlt } from '../tools/lut/vltConverter.mjs';

self.onmessage = ({ data }) => {
  try {
    const { filename, content } = convertFileToVlt(data.text, data.name);
    self.postMessage({ filename, content });
  } catch {
    self.postMessage(null);
  }
};
self.postMessage('ready');
