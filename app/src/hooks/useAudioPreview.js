import { useCallback, useEffect, useRef, useState } from 'react';

export function useAudioPreview() {
  const [playing, setPlaying] = useState(false);
  const player = useRef(null);
  const playbackContext = useRef(null);
  const previewEpoch = useRef(0);

  const stopPreview = useCallback(() => {
    previewEpoch.current++;
    if (player.current) {
      player.current.onended = null;
      try { player.current.stop(); } catch {}
      player.current = null;
    }
    setPlaying(false);
  }, []);
  useEffect(() => () => {
    previewEpoch.current++;
    if (player.current) { player.current.onended = null; try { player.current.stop(); } catch {} }
    void playbackContext.current?.close().catch(() => {});
  }, []);

  async function preview(buffer, onError) {
    if (playing) { stopPreview(); return; }
    if (!buffer) return;
    const epoch = ++previewEpoch.current;
    try {
      if (!playbackContext.current) playbackContext.current = new AudioContext();
      await playbackContext.current.resume();
      if (epoch !== previewEpoch.current) return;
      const source = playbackContext.current.createBufferSource();
      source.buffer = buffer;
      source.connect(playbackContext.current.destination);
      source.onended = stopPreview;
      player.current = source;
      source.start();
      setPlaying(true);
    } catch (error) { stopPreview(); onError(error.message || String(error)); }
  }

  return { playing, stopPreview, preview };
}
