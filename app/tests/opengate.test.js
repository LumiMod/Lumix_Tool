const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { Runtime } = require('../runtime');

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lumixtool-opengate-'));
  const events = [];
  const runtime = new Runtime({ configPath: path.join(directory, 'config.json'),
    legacyConfigPath: path.join(directory, 'old.json'), mock: true,
    onProgress: event => events.push(event) });
  return { runtime, events, directory };
}

test('open gate unlock toggles the mock camera with 19-step progress', async t => {
  const { runtime, events, directory } = fixture();
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  const before = await runtime.status();
  assert.equal(before.unlock.supported, true);
  assert.equal(before.unlock.unlocked, false);
  assert.equal(before.unlock.totalPatches, 19);

  const result = await runtime.setUnlock(true);
  assert.equal(result.ok, true);
  assert.equal(result.unlocked, true);
  assert.ok(events.some(event => event.phase === 'unlock' && event.done === 19 && event.total === 19));

  const after = await runtime.status();
  assert.equal(after.unlock.unlocked, true);
  assert.equal(after.unlock.unlockedWords, 19);

  assert.equal((await runtime.setUnlock(false)).ok, true);
  const restored = await runtime.status();
  assert.equal(restored.unlock.unlocked, false);
  assert.equal(restored.unlock.stock, true);
});

test('open gate refuses unverified mock firmware, bad arguments and non-Windows live mode', async t => {
  const { runtime, directory } = fixture();
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  runtime.configureMock({ scenario: 'unverified' });
  const refused = await runtime.setUnlock(true);
  assert.equal(refused.ok, false);
  assert.match(refused.error, /仅支持初代 DC-S5/);
  const status = await runtime.status();
  assert.equal(status.unlock.supported, false);
  assert.equal(status.unlock.unlocked, false);

  runtime.configureMock({ scenario: 'connected' });
  assert.match((await runtime.setUnlock('yes')).error, /参数无效/);
  assert.match((await runtime.setUnlock(1)).error, /参数无效/);

  const live = new Runtime({ configPath: path.join(directory, 'live.json'),
    legacyConfigPath: path.join(directory, 'old.json'), platform: 'linux' });
  const platformRefused = await live.setUnlock(true);
  assert.equal(platformRefused.ok, false);
  assert.match(platformRefused.error, /Windows WinUSB/);
});

test('desktop open gate renders connection, unlock, restore and progress states', async () => {
  const { createServer } = await import('vite');
  const server = await createServer({ root: path.resolve(__dirname, '..'), plugins: [{
    name: 'ssr-stub-css', enforce: 'pre',
    resolveId(id) { if (id.endsWith('.css')) return '\0stub-css'; },
    load(id) { if (id === '\0stub-css') return 'export default "";'; },
  }] });
  try {
    const { default: OpenGate } = await server.ssrLoadModule('/src/tools/OpenGate.jsx');
    const unlockInfo = extra => ({ supported: true, firmware: 'MC801 2.9', unlocked: false,
      fullyUnlocked: false, stock: true, unlockedWords: 2, verifiedAnchors: 13,
      totalAnchors: 13, totalPatches: 19, ...extra });
    const base = (unlock, extra = {}) => ({ api: {}, ready: true, locked: false, busy: null,
      progress: null, env: { python: 'python' }, navigate() {}, runOperation: async () => ({ ok: true }),
      device: { connected: true, body_version: '0x0290', unlock, ...extra } });
    const render = device => renderToStaticMarkup(React.createElement(OpenGate, { device }));

    const lockedHtml = render(base(unlockInfo({})));
    assert.ok(lockedHtml.includes('id="btnUnlockCamera"'));
    assert.ok(lockedHtml.includes('尚未解锁'));
    assert.ok(!lockedHtml.includes('id="btnPromptRestoreUnlock"'));

    const unlockedHtml = render(base(unlockInfo({ unlocked: true, fullyUnlocked: true, stock: false, unlockedWords: 19 })));
    assert.ok(unlockedHtml.includes('id="btnPromptRestoreUnlock"'));
    assert.ok(unlockedHtml.includes('已解锁'));
    assert.ok(!unlockedHtml.includes('id="btnUnlockCamera"'));

    const unsupportedHtml = render(base({ supported: false, unlocked: false, error: '固件特征不匹配' }));
    assert.ok(unsupportedHtml.includes('当前固件不支持片门全开解锁'));
    assert.ok(unsupportedHtml.includes('固件特征不匹配'));

    const disconnectedHtml = render({ ...base({}), device: { connected: false } });
    assert.ok(disconnectedHtml.includes('id="openGateConnectBtn"'));

    const busyHtml = render({ ...base(unlockInfo({})), locked: true,
      busy: { tool: 'open-gate' }, progress: { phase: 'unlock', done: 10, total: 19 } });
    assert.ok(busyHtml.includes('53%'));
  } finally { await server.close(); }
});
