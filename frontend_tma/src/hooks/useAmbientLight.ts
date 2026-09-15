/**
 * Illuminamento ambientale in lux.
 *
 * Percorso primario: AmbientLightSensor (Generic Sensor API), disponibile
 * su Chrome Android dietro permesso. Fallback: stima dalla luminanza media
 * dei frame della camera, calibrata sull'esposizione tipica di un sensore
 * mobile. La stima e' indicativa e il report lo dichiara.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export interface AmbientLightState {
  lux: number | null;
  /** true quando il valore viene dal sensore dedicato, non dalla stima. */
  fromSensor: boolean;
  compliant: boolean | null;
  error: string | null;
}

interface AmbientLightSensorLike {
  illuminance: number;
  start(): void;
  stop(): void;
  addEventListener(type: string, listener: () => void): void;
}

// Luminanza media (0-255) -> lux. Curva empirica: la risposta del sensore
// e' approssimativamente esponenziale nella parte utile della scala.
const LUMINANCE_TO_LUX = (luminance: number): number =>
  Math.round(Math.pow(luminance / 255, 2.2) * 3000);

export function useAmbientLight(minLux = 200) {
  const [state, setState] = useState<AmbientLightState>({
    lux: null,
    fromSensor: false,
    compliant: null,
    error: null,
  });
  const sensorRef = useRef<AmbientLightSensorLike | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const publish = useCallback(
    (lux: number, fromSensor: boolean) => {
      setState({ lux, fromSensor, compliant: lux >= minLux, error: null });
    },
    [minLux],
  );

  useEffect(() => {
    const SensorCtor = (window as unknown as { AmbientLightSensor?: new (options: { frequency: number }) => AmbientLightSensorLike })
      .AmbientLightSensor;
    if (!SensorCtor) return undefined;

    try {
      const sensor = new SensorCtor({ frequency: 1 });
      sensor.addEventListener('reading', () => publish(Math.round(sensor.illuminance), true));
      sensor.addEventListener('error', () =>
        setState((current) => ({ ...current, error: 'Sensore di luce non accessibile' })),
      );
      sensor.start();
      sensorRef.current = sensor;
    } catch {
      // Permesso negato o sensore assente: resta attivo il fallback.
      return undefined;
    }

    return () => sensorRef.current?.stop();
  }, [publish]);

  /**
   * Stima dal frame della camera. Va chiamata periodicamente dalla pagina di
   * acquisizione quando il sensore dedicato non e' disponibile.
   */
  const sampleFromVideo = useCallback(
    (video: HTMLVideoElement | null) => {
      if (!video || video.readyState < 2 || sensorRef.current) return;

      if (!canvasRef.current) {
        canvasRef.current = document.createElement('canvas');
        canvasRef.current.width = 64;
        canvasRef.current.height = 48;
      }
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) return;

      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);

      let total = 0;
      for (let i = 0; i < data.length; i += 4) {
        // Luminanza percettiva (Rec. 601).
        total += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      }
      const average = total / (data.length / 4);
      publish(LUMINANCE_TO_LUX(average), false);
    },
    [publish],
  );

  return { ...state, sampleFromVideo };
}
