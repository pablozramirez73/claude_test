/** Accesso alla camera posteriore, con gestione esplicita dei permessi. */
import { useCallback, useEffect, useRef, useState } from 'react';

export function useCamera(videoRef: React.RefObject<HTMLVideoElement>) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setReady(false);
  }, []);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
        },
        audio: false,
      });
      streamRef.current = stream;

      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        // iOS riproduce inline solo con questi attributi impostati.
        video.setAttribute('playsinline', 'true');
        video.muted = true;
        await video.play();
      }
      setReady(true);
      setError(null);
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Permesso camera negato: abilitalo dalle impostazioni del browser.'
          : 'Camera non disponibile su questo dispositivo.';
      setError(message);
      setReady(false);
    }
  }, [videoRef]);

  useEffect(() => stop, [stop]);

  return { ready, error, start, stop };
}
