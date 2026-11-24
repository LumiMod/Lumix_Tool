const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { mockMemoryMap } = require('../memory.mjs');

test('memory tool renders read-only controls, live ownership, run sizes and disabled states', async () => {
  const { createServer } = await import('vite');
  const server = await createServer({ root: path.resolve(__dirname, '..') });
  try {
    const { default: Memory } = await server.ssrLoadModule('/src/tools/memory/Memory.jsx');
    const map = { ...mockMemoryMap(), bodyVersion: '0x0290', scannedAt: '2026-11-22T00:00:00Z' };
    const device = { api: {}, ready: true, locked: false, device: { memoryMap: map,
      soundTable: { entries: [{ index: 1, addr: 0x0F000010, size: 88200 }] } } };
    const html = renderToStaticMarkup(React.createElement(Memory, { device }));
    for (const id of ['scanMemory', 'memoryMap', 'memoryRuns', 'exportMemory']) assert.ok(html.includes(`id="${id}"`), id);
    for (const text of ['只读诊断，不会写入相机', '0x0290', '0x8F000000', '暂存区总容量', '8,192 KiB', '89 KiB', '#1', '最大连续可写入', '空闲（0x55）', '其他数据', '全零']) assert.ok(html.includes(text), text);
    // Regression for Issue #1: a fresh scan while #1 (45,056 samples = 90,112 bytes) is live
    // only sees a 1 KiB LMXTSLOT header block, with #1's zero/data PCM blocks right after it;
    // the runs table must overlay live ownership (91 KiB) so overview and runs table agree.
    const issueMap = {
      bodyVersion: '0x0290',
      scannedAt: '2026-11-23T14:03:47.682Z',
      start: '0x8F000000',
      length: 8388608,
      runs: [
        { start: '0x8F000000', end: '0x8F000400', kind: 'lumixtool', kib: 1 },
        { start: '0x8F000400', end: '0x8F001400', kind: 'zero', kib: 4 },
        { start: '0x8F001400', end: '0x8F015C00', kind: 'data', kib: 82 },
        { start: '0x8F015C00', end: '0x8F016000', kind: 'zero', kib: 1 },
        { start: '0x8F016000', end: '0x8F800000', kind: 'data', kib: 8104 },
      ],
    };
    const issueHtml = renderToStaticMarkup(React.createElement(Memory, {
      device: { ...device, device: { memoryMap: issueMap, soundTable: { entries: [{ index: 1, addr: 0x0F000010, size: 90112 }] } } },
    }));
    assert.ok(issueHtml.includes('0x8F016C00'), 'live span end (91 KiB) appears in overlaid runs table');
    assert.ok(issueHtml.includes('8,101 KiB'), 'remaining 8,101 KiB matches both overview and runs table');
    assert.ok(!issueHtml.includes('0x8F000400'), 'raw 1 KiB header split is merged into live LumixTool run');
    const disconnected = renderToStaticMarkup(React.createElement(Memory, { device: { ...device, ready: false, device: {} } }));
    assert.match(disconnected, /<button[^>]*id="scanMemory"[^>]*disabled/);
    assert.match(disconnected, /<button[^>]*id="exportMemory"[^>]*disabled/);
    const busy = renderToStaticMarkup(React.createElement(Memory, { device: { ...device, locked: true,
      busy: { tool: 'memory' }, progress: { phase: 'scan', done: 4096, total: 8192 } } }));
    assert.match(busy, /<button[^>]*id="scanMemory"[^>]*disabled/);
    assert.ok(busy.includes('正在只读扫描 RAM'));
    assert.ok(busy.includes('50%'));
  } finally { await server.close(); }
});
