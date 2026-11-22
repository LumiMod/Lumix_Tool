export const SCRATCH_VIRTUAL = 0x0F000000;

export function originalSamples(hex) {
  if (typeof hex !== 'string' || !/^[0-9a-f]{64}$/i.test(hex)) return null;
  const bytes = Uint8Array.from(hex.match(/../g), byte => parseInt(byte, 16));
  // The table stores PCM length in bytes at +0x14; the UI works in samples.
  return new DataView(bytes.buffer).getUint32(0x14, true) / 2;
}

export function slotState(entry, original) {
  if (!entry?.hex) return '未知';
  if (Number(entry.addr) >= SCRATCH_VIRTUAL && Number(entry.addr) < 0x0F800000) return '已替换';
  return original && entry.hex.toLowerCase() === original.toLowerCase() ? '原厂' : '未知';
}
