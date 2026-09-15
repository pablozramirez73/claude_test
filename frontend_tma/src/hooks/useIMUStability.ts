/**
 * Stabilita' del telefono tramite IMU (accelerometro + giroscopio).
 *
 * Gli angoli articolari ricostruiti da una singola camera sono attendibili
 * solo se l'inquadratura resta ferma: se la deviazione media supera la
 * soglia (2° di default) la scansione va bloccata.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export interface IMUState {
  /** Deviazione angolare media rispetto alla posa iniziale, in gradi. */
  deviationDeg: number;
  stable: boolean;
  supported: boolean;
  /** iOS 13+ richiede un gesto dell'utente per concedere l'accesso. */
  permission: 'unknown' | 'granted' | 'denied' | 'unsupported';
}

const WINDOW_SIZE = 30; // ~0.5 s di campioni a 60 Hz

interface DeviceOrientationEventStatic {
  requestPermission?: () => Promise<'granted' | 'denied'>;
}

export function useIMUStability(maxTiltDeg = 2): IMUState & { requestPermission: () => Promise<void> } {
  const [state, setState] = useState<IMUState>({
    deviationDeg: 0,
    stable: true,
    supported: typeof window !== 'undefined' && 'DeviceOrientationEvent' in window,
    permission: 'unknown',
  });

  const referenceRef = useRef<{ beta: number; gamma: number } | null>(null);
  const samplesRef = useRef<number[]>([]);

  const handleOrientation = useCallback(
    (event: DeviceOrientationEvent) => {
      const beta = event.beta ?? 0;
      const gamma = event.gamma ?? 0;

      // Il primo campione fissa la posa di riferimento (telefono sul treppiede).
      if (!referenceRef.current) {
        referenceRef.current = { beta, gamma };
        return;
      }

      const reference = referenceRef.current;
      const deviation = Math.hypot(beta - reference.beta, gamma - reference.gamma);

      const samples = samplesRef.current;
      samples.push(deviation);
      if (samples.length > WINDOW_SIZE) samples.shift();

      const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
      const rounded = Math.round(mean * 100) / 100;

      setState((current) =>
        // Si aggiorna solo se il valore cambia davvero: evita render inutili.
        current.deviationDeg === rounded && current.stable === rounded <= maxTiltDeg
          ? current
          : { ...current, deviationDeg: rounded, stable: rounded <= maxTiltDeg, permission: 'granted' },
      );
    },
    [maxTiltDeg],
  );

  const requestPermission = useCallback(async () => {
    const constructor = window.DeviceOrientationEvent as unknown as DeviceOrientationEventStatic;
    if (typeof constructor?.requestPermission === 'function') {
      try {
        const outcome = await constructor.requestPermission();
        setState((current) => ({ ...current, permission: outcome }));
      } catch {
        setState((current) => ({ ...current, permission: 'denied' }));
      }
      return;
    }
    setState((current) => ({
      ...current,
      permission: current.supported ? 'granted' : 'unsupported',
    }));
  }, []);

  useEffect(() => {
    if (!state.supported || state.permission === 'denied') return undefined;
    window.addEventListener('deviceorientation', handleOrientation);
    return () => window.removeEventListener('deviceorientation', handleOrientation);
  }, [handleOrientation, state.permission, state.supported]);

  /** Riallinea il riferimento: da chiamare quando si riposiziona il telefono. */
  useEffect(() => {
    const reset = () => {
      referenceRef.current = null;
      samplesRef.current = [];
    };
    window.addEventListener('ergocheck:recalibrate', reset);
    return () => window.removeEventListener('ergocheck:recalibrate', reset);
  }, []);

  return { ...state, requestPermission };
}

export const recalibrateIMU = () =>
  window.dispatchEvent(new Event('ergocheck:recalibrate'));
