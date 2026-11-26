import LutWorker from './convertLut.worker.js?worker&inline';
import { convertFileToVlt } from '../tools/lut/vltConverter.mjs';

export async function convertIosFile(text, name) {
  let worker;
  try {
    worker = new LutWorker();
  } catch {
    return convertFileToVlt(text, name);
  }

  let startupTimer;
  let result;
  try {
    result = await new Promise((resolve, reject) => {
      let started = false;
      // A suspended WebView may create the worker without ever running its script.
      startupTimer = setTimeout(() => resolve(null), 5000);
      worker.onmessage = ({ data }) => {
        if (data === 'ready') {
          clearTimeout(startupTimer);
          try {
            worker.postMessage({ text, name });
            started = true;
          } catch (error) {
            reject(error);
          }
        } else if (data) {
          resolve(data);
        } else {
          reject(new Error('Invalid LUT'));
        }
      };
      worker.onerror = event => {
        event.preventDefault();
        if (started) reject(new Error('LUT conversion failed'));
        else resolve(null);
      };
      worker.onmessageerror = () => reject(new Error('Unreadable worker message'));
    });
  } finally {
    clearTimeout(startupTimer);
    worker.terminate();
  }
  return result ?? convertFileToVlt(text, name);
}
