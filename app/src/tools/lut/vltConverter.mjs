/**
 * Panasonic Lumix DC-S5 .VLT converter & built-in LUT presets.
 *
 * Verified against DC-S5 MC801 v2.9 AVIO_ReadLUTFile (0x867BE1F0):
 * - Header MUST be 4 lines: 2 comment lines, line 3 = "LUT_3D_SIZE 17", line 4 = blank
 * - Data: 17x17x17 = 4913 lines of 12-bit integers (0..4095), R-fastest order
 * - Filename: up to 8 ASCII alphanumeric chars + ".VLT" in SD card root
 */

import { getBeefWordMap } from './beefMap.mjs';

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function to12Bit(v) {
  return Math.round(clamp01(v) * 4095);
}

export function sanitizeVltFilename(rawName = 'CUSTOM') {
  const base = String(rawName)
    .replace(/\.[^.]+$/, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
  return (base || 'CUSTOM') + '.VLT';
}

export function parseCubeText(text) {
  const lines = String(text || '').split(/\r?\n/);
  let size = 0;
  let title = '';
  const data = [];

  for (const raw of lines) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const upper = line.toUpperCase();
    if (upper.startsWith('TITLE')) {
      title = line.slice(5).trim().replace(/^["']|["']$/g, '');
      continue;
    }
    if (upper.startsWith('LUT_3D_SIZE')) {
      size = parseInt(line.split(/\s+/)[1], 10) || 0;
      continue;
    }
    if (/^(DOMAIN_MIN|DOMAIN_MAX|LUT_1D_SIZE|LUT_1D_INPUT_RANGE|LUT_3D_INPUT_RANGE)\b/i.test(line)) {
      continue;
    }
    const parts = line.split(/\s+/);
    if (parts.length >= 3) {
      const r = Number(parts[0]);
      const g = Number(parts[1]);
      const b = Number(parts[2]);
      if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
        data.push([r, g, b]);
      }
    }
  }

  if (size < 2 || size > 129) {
    throw new Error('无效的 .cube 文件：未找到合法的 LUT_3D_SIZE。');
  }
  const expected = size * size * size;
  if (data.length !== expected) {
    throw new Error(`无效的 .cube 文件：期望 ${expected} 条数据，实际 ${data.length} 条。`);
  }
  return { size, title, data };
}

function sampleCubeTrilinear(cube, r, g, b) {
  const n = cube.size;
  const max = n - 1;
  const rx = clamp01(r) * max;
  const gx = clamp01(g) * max;
  const bx = clamp01(b) * max;

  const r0 = Math.min(max - 1, Math.floor(rx));
  const g0 = Math.min(max - 1, Math.floor(gx));
  const b0 = Math.min(max - 1, Math.floor(bx));
  const r1 = r0 + 1;
  const g1 = g0 + 1;
  const b1 = b0 + 1;

  const fr = rx - r0;
  const fg = gx - g0;
  const fb = bx - b0;

  const at = (ri, gi, bi) => cube.data[(bi * n + gi) * n + ri];
  const c000 = at(r0, g0, b0);
  const c100 = at(r1, g0, b0);
  const c010 = at(r0, g1, b0);
  const c110 = at(r1, g1, b0);
  const c001 = at(r0, g0, b1);
  const c101 = at(r1, g0, b1);
  const c011 = at(r0, g1, b1);
  const c111 = at(r1, g1, b1);

  const out = [0, 0, 0];
  for (let ch = 0; ch < 3; ch++) {
    const c00 = c000[ch] * (1 - fr) + c100[ch] * fr;
    const c10 = c010[ch] * (1 - fr) + c110[ch] * fr;
    const c01 = c001[ch] * (1 - fr) + c101[ch] * fr;
    const c11 = c011[ch] * (1 - fr) + c111[ch] * fr;
    const c0 = c00 * (1 - fg) + c10 * fg;
    const c1 = c01 * (1 - fg) + c11 * fg;
    out[ch] = clamp01(c0 * (1 - fb) + c1 * fb);
  }
  return out;
}

const VLT_HEADER = '#Panasonic V-Log LUT\r\n#VLT file\r\nLUT_3D_SIZE 17\r\n\r\n';

export function convertCubeToVlt(cubeText, sourceFilename = 'CUSTOM.cube') {
  const cube = parseCubeText(cubeText);
  const lines = [];
  for (let bi = 0; bi < 17; bi++) {
    const b = bi / 16;
    for (let gi = 0; gi < 17; gi++) {
      const g = gi / 16;
      for (let ri = 0; ri < 17; ri++) {
        const r = ri / 16;
        const [ro, go, bo] = cube.size === 17
          ? cube.data[(bi * 17 + gi) * 17 + ri]
          : sampleCubeTrilinear(cube, r, g, b);
        lines.push(`${to12Bit(ro)} ${to12Bit(go)} ${to12Bit(bo)}`);
      }
    }
  }
  return {
    filename: sanitizeVltFilename(sourceFilename),
    sourceSize: cube.size,
    title: cube.title,
    content: VLT_HEADER + lines.join('\r\n') + '\r\n',
  };
}

export function convertFileToVlt(text, filename) {
  if (!/\.vlt$/i.test(filename)) return convertCubeToVlt(text, filename);
  const lut = parseVltText(text);
  // The card reader requires a fixed header and a 17-point table, even for 9-point VLT inputs.
  const cube = ['LUT_3D_SIZE ' + lut.size, ...lut.data.map(row => row.join(' '))].join('\n');
  return convertCubeToVlt(cube, filename);
}

function vlogSCurve(x) {
  const t = clamp01((x - 0.12) / 0.68);
  return clamp01(t * t * (3 - 2 * t));
}

export function buildPresetVlt(presetId) {
  const lines = [];
  if (presetId === 'bw') {
    for (let bi = 0; bi < 17; bi++) {
      const b0 = bi / 16;
      for (let gi = 0; gi < 17; gi++) {
        const g0 = gi / 16;
        for (let ri = 0; ri < 17; ri++) {
          const r0 = ri / 16;
          const lum = 0.299 * r0 + 0.587 * g0 + 0.114 * b0;
          let v = vlogSCurve(lum);
          v = clamp01(v * v * (3 - 2 * v));
          const iv = to12Bit(v);
          lines.push(`${iv} ${iv} ${iv}`);
        }
      }
    }
    return { filename: 'BWHC.VLT', content: VLT_HEADER + lines.join('\r\n') + '\r\n' };
  }

  // Default: CINEWARM.VLT (Teal & Orange cinema look)
  for (let bi = 0; bi < 17; bi++) {
    const b0 = bi / 16;
    for (let gi = 0; gi < 17; gi++) {
      const g0 = gi / 16;
      for (let ri = 0; ri < 17; ri++) {
        const r0 = ri / 16;
        const r = vlogSCurve(r0);
        const g = vlogSCurve(g0);
        const b = vlogSCurve(b0);
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        const sh = clamp01(1 - lum * 1.8);
        const hi = clamp01((lum - 0.35) * 1.6);
        const ro = clamp01(r * 1.15 - sh * 0.22 + hi * 0.28);
        const go = clamp01(g * 1.02 + sh * 0.05 + hi * 0.08);
        const bo = clamp01(b * 0.85 + sh * 0.28 - hi * 0.32);
        lines.push(`${to12Bit(ro)} ${to12Bit(go)} ${to12Bit(bo)}`);
      }
    }
  }
  return { filename: 'CINEWARM.VLT', content: VLT_HEADER + lines.join('\r\n') + '\r\n' };
}

export function parseVltText(text) {
  const lines = String(text || '').split(/\r?\n/);
  let size = 0;
  const data = [];
  for (const raw of lines) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    if (line.toUpperCase().startsWith('LUT_3D_SIZE')) {
      size = parseInt(line.split(/\s+/)[1], 10) || 0;
      continue;
    }
    const parts = line.split(/\s+/);
    if (parts.length >= 3) {
      const r = parseInt(parts[0], 10);
      const g = parseInt(parts[1], 10);
      const b = parseInt(parts[2], 10);
      if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
        data.push([clamp01(r / 4095), clamp01(g / 4095), clamp01(b / 4095)]);
      }
    }
  }
  if ((size !== 9 && size !== 17) || data.length !== size * size * size) {
    throw new Error('无效的 .VLT 文件。');
  }
  return { size, title: 'VLT', data };
}

/**
 * Encode any parsed 3D LUT into Panasonic DC-S5 native 2,920-byte 0x0001BEEF RAM format.
 * Verified hardware layout:
 * - Header: uint32 LE 0x0001BEEF
 * - 729 entries mapped by exact 0x06E39EB4 octant word map
 * - Input index order: (g * 9 + b) * 9 + r
 * - Output 18-bit word: (g6 << 12) | (b6 << 6) | r6  (each 0..63)
 */
export function encodeLutToBeef(lut) {
  const wordMap = getBeefWordMap();
  const out = new Uint8Array(2920);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x0001BEEF, true);

  const to6 = v => Math.min(63, Math.max(0, Math.round(clamp01(v) * 63)));

  for (let g = 0; g < 9; g++) {
    const gf = g / 8;
    for (let b = 0; b < 9; b++) {
      const bf = b / 8;
      for (let r = 0; r < 9; r++) {
        const rf = r / 8;
        const [ro, go, bo] = sampleCubeTrilinear(lut, rf, gf, bf);
        const word = (to6(go) << 12) | (to6(bo) << 6) | to6(ro);
        const hwFlat = (g * 9 + b) * 9 + r;
        const wordIdx = wordMap[hwFlat];
        view.setUint32(wordIdx * 4, word, true);
      }
    }
  }
  return out;
}

export function convertTextToBeef(text, filename = '') {
  const isVlt = /\.vlt$/i.test(filename) || (/LUT_3D_SIZE\s+(?:9|17)/i.test(text) && !/\d+\.\d+/.test(text.slice(0, 800)));
  const parsed = isVlt ? parseVltText(text) : parseCubeText(text);
  return { bytes: encodeLutToBeef(parsed), sourceSize: parsed.size, title: parsed.title };
}

export function buildPresetBeef(presetId) {
  const vlt = buildPresetVlt(presetId);
  return { filename: vlt.filename, bytes: encodeLutToBeef(parseVltText(vlt.content)) };
}
