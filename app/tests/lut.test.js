const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { Runtime } = require('../runtime');

test('vltConverter: sanitize filename, convert 9x9x9 .cube, and build presets', async () => {
  const { sanitizeVltFilename, convertCubeToVlt, buildPresetVlt } = await import('../src/tools/lut/vltConverter.mjs');

  assert.equal(sanitizeVltFilename('My_Cine-LUT 2026!.cube'), 'MYCINELU.VLT');
  assert.equal(sanitizeVltFilename('___'), 'CUSTOM.VLT');

  // Build minimal valid 2x2x2 identity .cube
  const cubeLines = ['TITLE "Identity"', 'LUT_3D_SIZE 2'];
  for (let b = 0; b < 2; b++) {
    for (let g = 0; g < 2; g++) {
      for (let r = 0; r < 2; r++) {
        cubeLines.push(`${r}.0 ${g}.0 ${b}.0`);
      }
    }
  }
  const vlt = convertCubeToVlt(cubeLines.join('\n'), 'test_id.cube');
  assert.equal(vlt.filename, 'TESTID.VLT');
  assert.equal(vlt.sourceSize, 2);
  const lines = vlt.content.split('\r\n');
  assert.equal(lines[0], '#Panasonic V-Log LUT');
  assert.equal(lines[1], '#VLT file');
  assert.equal(lines[2], 'LUT_3D_SIZE 17');
  assert.equal(lines[3], '');
  assert.equal(lines[4], '0 0 0');
  // Last entry (index 4 + 4912 = 4916) should be white 4095 4095 4095
  assert.equal(lines[4 + 4912], '4095 4095 4095');

  const cw = buildPresetVlt('cinewarm');
  assert.equal(cw.filename, 'CINEWARM.VLT');
  assert.equal(cw.content.split('\r\n').filter(Boolean).length, 3 + 4913);

  const bw = buildPresetVlt('bw');
  assert.equal(bw.filename, 'BWHC.VLT');
  assert.equal(bw.content.split('\r\n').filter(Boolean).length, 3 + 4913);
});

test('Runtime.setLut works in mock mode and rejects unverified firmware', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lumix-lut-test-'));
  try {
    const rt = new Runtime({
      configPath: path.join(tmp, 'config.json'),
      legacyConfigPath: path.join(tmp, 'legacy.json'),
      scriptPath: path.join(__dirname, '..', 'python', 's5focus.py'),
      mock: true,
    });
    const st0 = await rt.status();
    assert.equal(st0.lut.supported, true);
    assert.equal(st0.lut.enabled, false);

    const en = await rt.setLut({ enable: true, mode: 'fast', playbackFix: true });
    assert.equal(en.ok, true);
    assert.equal(en.enabled, true);
    assert.equal(en.mode, 'fast');
    assert.equal(en.playbackFix, true);

    const st1 = await rt.status();
    assert.equal(st1.lut.enabled, true);
    assert.equal(st1.lut.mode, 'fast');

    const off = await rt.setLut({ enable: false });
    assert.equal(off.ok, true);
    assert.equal(off.enabled, false);

    rt.configureMock({ scenario: 'unverified' });
    const bad = await rt.setLut({ enable: true, mode: 'fast' });
    assert.equal(bad.ok, false);
    assert.equal(bad.supported, false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
