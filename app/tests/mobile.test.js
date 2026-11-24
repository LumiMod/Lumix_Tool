const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

test('mobileApi encodes PCM, scans uncached memory, allocates slots, and renders clean MobileApp & OpenGate', async () => {
  const { createServer } = await import('vite');
  const server = await createServer({
    root: path.resolve(__dirname, '..'),
    mode: 'android',
    plugins: [{
      name: 'ssr-stub-css',
      enforce: 'pre',
      resolveId(id) {
        if (id.endsWith('.css')) return '\0stub-css';
      },
      load(id) {
        if (id === '\0stub-css') return 'export default "";';
      },
    }],
  });
  try {
    const { mockMemoryMap } = await server.ssrLoadModule('/memory.mjs');
    const calls = [];
    let savedMap = null;
    globalThis.window = {
      addEventListener() {},
      removeEventListener() {},
      LumixAndroid: {
        invoke(requestId, method, payloadJson) {
          const args = JSON.parse(payloadJson);
          calls.push({ method, args });
          if (method === 'scanMemory') {
            globalThis.window.__lumixResolve(requestId, {
              ok: true,
              map: { ...mockMemoryMap(), scannedAt: '2026-11-24T00:00:00Z', bodyVersion: '0x0290' },
            });
          } else if (method === 'applySlots') {
            globalThis.window.__lumixResolve(requestId, { ok: true, succeeded: args.allocations.map(a => a.index) });
          } else if (method === 'saveMemoryMap') {
            savedMap = args.map;
            globalThis.window.__lumixResolve(requestId, { ok: true });
          } else {
            globalThis.window.__lumixResolve(requestId, { ok: true, connected: false, mode: 'none' });
          }
        },
      },
    };

    const mobileApi = await server.ssrLoadModule('/src/mobileApi.js');

    const raw = new Uint8Array(90000);
    for (let i = 0; i < raw.length; i++) raw[i] = (i * 13) & 0xff;
    const b64 = mobileApi.arrayBufferToBase64(raw.buffer);
    assert.deepEqual(new Uint8Array(Buffer.from(b64, 'base64')), raw);

    const res = await mobileApi.applySoundBatch({
      indices: [1, 2],
      pcm: new Uint8Array(2000).buffer,
      samples: 1000,
      version: '0x0290',
      currentMap: null,
      entries: [],
    });
    assert.equal(res.ok, true);
    assert.deepEqual(res.succeeded, [1, 2]);
    assert.deepEqual(calls.map(c => c.method), ['scanMemory', 'applySlots', 'saveMemoryMap']);
    assert.equal(calls[1].args.allocations[0].address, '0x8F000000');
    assert.equal(calls[1].args.allocations[1].address, '0x8F001000');
    assert.equal(savedMap.runs[0].kind, 'lumixtool');

    const { default: OpenGate } = await server.ssrLoadModule('/src/tools/OpenGate.jsx');
    const desktopHtml = renderToStaticMarkup(React.createElement(OpenGate, { mobile: false }));
    assert.match(desktopHtml, /6K 片门全开/);
    assert.match(desktopHtml, /5952 × 3968/);

    const mobileArmedHtml = renderToStaticMarkup(React.createElement(OpenGate, {
      mobile: true,
      deviceState: {
        connected: true,
        body_version: '0x0290',
        unlock: { supported: true, unlocked: true, firmware: 'MC801 2.9' },
      },
    }));
    assert.match(mobileArmedHtml, /已解锁，可直接拔下数据线/);
    assert.match(mobileArmedHtml, /恢复原厂默认/);

    const { default: MobileApp } = await server.ssrLoadModule('/src/MobileApp.jsx');
    const homeHtml = renderToStaticMarkup(React.createElement(MobileApp));
    assert.match(homeHtml, /片门全开解锁/);
    assert.match(homeHtml, /相机音效替换/);

    globalThis.history = { state: { tool: 'camera' } };
    const cameraHtml = renderToStaticMarkup(React.createElement(MobileApp));
    assert.match(cameraHtml, /guide-ring/);
    assert.match(cameraHtml, /回放 ▶/);
    assert.match(cameraHtml, /AF-ON/);
    delete globalThis.history;
  } finally {
    delete globalThis.window;
    await server.close();
  }
});
