/**
 * Livello di rumore ambientale con Web Audio API.
 *
 * Il microfono di uno smartphone non e' un fonometro di classe 1: il valore
 * e' una stima ricavata dall'RMS del segnale con un offset di calibrazione,
 * utile come pre-screening rispetto al valore inferiore di azione (80 dB(A)
 * dell'art. 189 D.Lgs 81/08). Il report lo dichiara esplicitamente.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export interface NoiseState {
  db: number | null;
  peakDb: number | null;
  compliant: boolean | null;
  listening: boolean;
  error: string | null;
}

// dBFS -> dB SPL: uno smartphone tipico satura attorno ai 100 dB SPL,
// quindi 0 dBFS corrisponde grosso modo a 100 dB(A).
const CALIBRATION_OFFSET_DB = 100;

export function useNoiseLevel(maxDb = 80) {
  const [state, setState] = useState<NoiseState>({
    db: null,
    peakDb: null,
    compliant: null,
    listening: false,
    error: null,
  });

  const contextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const peakRef = useRef(0);

  const stop = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void contextRef.current?.close();
    contextRef.current = null;
    setState((current) => ({ ...current, listening: false }));
  }, []);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        // Le elaborazioni del browser falserebbero la misura.
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      streamRef.current = stream;

      const context = new AudioContext();
      contextRef.current = context;
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);

      const buffer = new Float32Array(analyser.fftSize);
      setState((current) => ({ ...current, listening: true, error: null }));

      const measure = () => {
        analyser.getFloatTimeDomainData(buffer);
        let sumSquares = 0;
        for (let i = 0; i < buffer.length; i += 1) sumSquares += buffer[i] * buffer[i];
        const rms = Math.sqrt(sumSquares / buffer.length);

        if (rms > 1e-7) {
          const db = Math.round(20 * Math.log10(rms) + CALIBRATION_OFFSET_DB);
          peakRef.current = Math.max(peakRef.current, db);
          setState((current) =>
            current.db === db
              ? current
              : { ...current, db, peakDb: peakRef.current, compliant: db <= maxDb },
          );
        }
        rafRef.current = requestAnimationFrame(measure);
      };
      rafRef.current = requestAnimationFrame(measure);
    } catch (err) {
      setState((current) => ({
        ...current,
        error: err instanceof Error ? err.message : 'Microfono non disponibile',
        listening: false,
      }));
    }
  }, [maxDb]);

  useEffect(() => stop, [stop]);

  return { ...state, start, stop };
}
