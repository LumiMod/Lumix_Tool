import { markRange, planAllocation, validMap } from '../memory.mjs';

let nextRequestId = 1;
const pendingRequests = new Map();

if (typeof window !== 'undefined') {
  window.__lumixResolve = (requestId, payload) => {
    const entry = pendingRequests.get(requestId);
    if (!entry) return;
    pendingRequests.delete(requestId);
    entry.resolve(payload || { ok: false, error: '空响应' });
  };
}

export const GITHUB_REPO_URL = 'https://github.com/USER-HFC/Lumix_Tool';

export function hasNativeBridge() {
  return typeof window !== 'undefined' && typeof window.LumixAndroid?.invoke === 'function';
}

export function openExternal(url = GITHUB_REPO_URL) {
  if (hasNativeBridge()) {
    return invokeNative('openExternal', { url });
  }
  if (typeof window !== 'undefined' && typeof window.open === 'function') {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
  return Promise.resolve({ ok: true });
}

export function invokeNative(method, payload = {}) {
  if (!hasNativeBridge()) {
    return Promise.resolve({
      ok: false,
      connected: false,
      mode: 'browser',
      error: '当前运行在普通浏览器环境，请在 Android 应用中通过 OTG 连接相机。',
    });
  }
  const requestId = `req_${nextRequestId++}_${Date.now()}`;
  return new Promise(resolve => {
    pendingRequests.set(requestId, { resolve });
    try {
      window.LumixAndroid.invoke(requestId, method, JSON.stringify(payload || {}));
    } catch (error) {
      pendingRequests.delete(requestId);
      resolve({ ok: false, connected: false, error: error.message || String(error) });
    }
  });
}

export function arrayBufferToBase64(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const slice = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
    binary += String.fromCharCode.apply(null, slice);
  }
  return btoa(binary);
}

export async function applySoundBatch({ indices, pcm, samples, version, currentMap, entries }) {
  let map = validMap(currentMap) ? currentMap : null;
  if (!map) {
    const scanRes = await invokeNative('scanMemory');
    if (!scanRes?.ok || !validMap(scanRes.map)) {
      return { ok: false, error: scanRes?.error || '首次内存扫描未完成，未执行任何写入。', succeeded: [] };
    }
    map = scanRes.map;
  }

  const plan = planAllocation(map, entries || [], indices, samples);
  if (!plan.ok) {
    return { ...plan, succeeded: [] };
  }

  const pcmBase64 = arrayBufferToBase64(pcm);
  const response = await invokeNative('applySlots', {
    version,
    samples,
    pcmBase64,
    allocations: plan.allocations,
  });

  const succeeded = Array.isArray(response?.succeeded) ? response.succeeded : [];
  let updatedMap = map;
  let mapDirty = false;

  for (const alloc of plan.allocations) {
    if (succeeded.includes(alloc.index)) {
      updatedMap = markRange(updatedMap, alloc.start, alloc.end, 'lumixtool');
      mapDirty = true;
    } else if (response?.failedIndex === alloc.index && response?.error === 'region not free') {
      updatedMap = markRange(updatedMap, alloc.start, alloc.end, 'lumixtool');
      mapDirty = true;
    }
  }

  if (mapDirty) {
    await invokeNative('saveMemoryMap', { map: updatedMap });
  }

  return response;
}

export function restoreSoundBatch({ indices = null, version }) {
  return invokeNative('restoreSlots', {
    version,
    ...(Array.isArray(indices) ? { indices } : {}),
  });
}
