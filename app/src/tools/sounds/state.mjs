export const SCRATCH_VIRTUAL = 0x0F000100;

export function originalSamples(hex) {
  if (typeof hex !== 'string' || !/^[0-9a-f]{64}$/i.test(hex)) return null;
  const bytes = Uint8Array.from(hex.match(/../g), byte => parseInt(byte, 16));
  return new DataView(bytes.buffer).getUint32(0x14, true);
}

export function slotState(entry, original) {
  if (!entry?.hex) return '未知';
  if (Number(entry.addr) >= SCRATCH_VIRTUAL) return '已替换';
  return original && entry.hex.toLowerCase() === original.toLowerCase() ? '原厂' : '未知';
}
