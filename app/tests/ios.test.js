const { test } = require('node:test');
const assert = require('node:assert/strict');

test('iOS file operations preserve cancellation and USB discovery stays user-initiated', async (t) => {
  const calls = [];
  const replies = [];
  globalThis.webkit = { messageHandlers: { bridge: {} } };
  globalThis.Capacitor = {
    PluginHeaders: [{
      name: 'LumixIOS',
      methods: ['pickLutFile', 'saveVlt', 'discoverCameras'].map(name => ({ name, rtype: 'promise' })),
    }],
    async nativePromise(plugin, method, options) {
      assert.equal(plugin, 'LumixIOS');
      calls.push({ method, options });
      return replies.shift();
    },
  };
  t.after(() => {
    delete globalThis.webkit;
    delete globalThis.Capacitor;
  });
  const { pickLutFile, saveVlt, discoverCameras } = await import('../src/ios/native.mjs');
  assert.deepEqual(calls, []);

  const file = { name: 'LOOK01.cube', text: 'LUT_3D_SIZE 2' };
  replies.push({ canceled: true }, file);
  assert.equal(await pickLutFile(), null);
  assert.deepEqual(await pickLutFile(), file);

  const canceled = { ok: false, canceled: true };
  const saved = { ok: true, filename: 'RENAMED.VLT' };
  replies.push(canceled, saved, { status: 'empty', devices: [] });
  assert.deepEqual(await saveVlt('LOOK01.VLT', 'example'), canceled);
  assert.deepEqual(await saveVlt('LOOK01.VLT', 'example'), saved);
  assert.deepEqual(await discoverCameras(), { status: 'empty', devices: [] });
  assert.deepEqual(calls.map(call => call.method),
    ['pickLutFile', 'pickLutFile', 'saveVlt', 'saveVlt', 'discoverCameras']);
  assert.deepEqual(calls[2].options, { filename: 'LOOK01.VLT', content: 'example' });
});
