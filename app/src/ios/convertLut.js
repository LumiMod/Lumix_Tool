import LutWorker from './convertLut.worker.js?worker&inline';
import { convertFileToVlt } from '../tools/lut/vltConverter.mjs';

export async function convertIosFile(text, name) {
  let worker;
  try {
    worker = new LutWorker();
  } catch {
    return convertFileToVlt(text, name);
  }

  try {
    const result = await new Promise((resolve, reject) => {
      let started = false;
      worker.onmessage = ({ data }) => {
        if (data === 'ready') {
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
    // Some WebViews expose Worker but cannot start its script. Use the same converter locally.
    return result ?? convertFileToVlt(text, name);
  } finally {
    worker.terminate();
  }
}
