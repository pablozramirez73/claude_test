/**
 * Analisi della posa on-device con MediaPipe Tasks Vision.
 *
 * L'intero calcolo resta sul telefono: al backend si inviano soltanto gli
 * angoli aggregati. Nessun frame video lascia il dispositivo, il che tiene
 * fuori dal perimetro GDPR le immagini del lavoratore.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  FaceLandmarker as FaceLandmarkerType,
  HandLandmarker as HandLandmarkerType,
  PoseLandmarker as PoseLandmarkerType,
} from '@mediapipe/tasks-vision';

import {
  AngleAccumulator,
  FatigueTracker,
  classifyGrip,
  computeAngles,
  liveWarnings,
  type Landmark,
  type LiveWarning,
  type PoseAngles,
} from '../lib/ergo-calculator';
import type { PoseData } from '../types';

const WASM_BASE =
  import.meta.env.VITE_WASM_BASE ??
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const POSE_MODEL =
  import.meta.env.VITE_POSE_MODEL_URL ?? '/mediapipe/pose_landmarker_lite.task';
const FACE_MODEL = import.meta.env.VITE_FACE_MODEL_URL ?? '/mediapipe/face_landmarker.task';
const HAND_MODEL = import.meta.env.VITE_HAND_MODEL_URL ?? '/mediapipe/hand_landmarker.task';

export type CaptureStatus = 'idle' | 'loading' | 'ready' | 'running' | 'done' | 'error';

/** Oltre questo tempo senza un solo frame analizzato l'acquisizione si arrende. */
const WARMUP_TIMEOUT_MS = 20_000;

export interface LiveState {
  angles: PoseAngles | null;
  warnings: LiveWarning[];
  /** Landmark normalizzati dell'ultimo frame, per l'overlay. */
  landmarks: Landmark[] | null;
  fps: number;
  progress: number; // 0..1
}

interface Options {
  videoRef: React.RefObject<HTMLVideoElement>;
  /** Face Landmarker per gli indicatori di fatica (solo postazione VDT). */
  enableFace?: boolean;
  /** Hand Landmarker per la qualita' della presa (solo sollevamento). */
  enableHand?: boolean;
  limits: { trunkFlexion: number; trunkTwist: number; armElevation: number; neckFlexion: number };
  /** Durata della finestra di acquisizione. */
  durationMs?: number;
  onComplete?: (data: PoseData, elapsedSeconds: number) => void;
  onWarning?: (warning: LiveWarning) => void;
}

const EMPTY_LIVE: LiveState = {
  angles: null,
  warnings: [],
  landmarks: null,
  fps: 0,
  progress: 0,
};

export function useMediapipePose({
  videoRef,
  enableFace = false,
  enableHand = false,
  limits,
  durationMs = 15_000,
  onComplete,
  onWarning,
}: Options) {
  const [status, setStatus] = useState<CaptureStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState<LiveState>(EMPTY_LIVE);

  const poseRef = useRef<PoseLandmarkerType | null>(null);
  const faceRef = useRef<FaceLandmarkerType | null>(null);
  const handRef = useRef<HandLandmarkerType | null>(null);

  const rafRef = useRef<number | null>(null);
  // 0 = acquisizione avviata ma nessun frame ancora analizzato. La prima
  // chiamata a detectForVideo compila le shader sulla GPU e blocca per
  // qualche secondo: far partire il cronometro dal click brucerebbe quel
  // tempo, lasciando all'operatore molto meno dei 15 s dichiarati.
  const startedAtRef = useRef(0);
  const launchedAtRef = useRef(0);
  const lastVideoTimeRef = useRef(-1);
  const frameCountRef = useRef(0);
  const fatigueRef = useRef(new FatigueTracker());
  const gripCountsRef = useRef<Record<string, number>>({});
  const confidenceRef = useRef({ sum: 0, count: 0 });
  const accumulatorsRef = useRef({
    trunkFlexion: new AngleAccumulator(),
    trunkTwist: new AngleAccumulator(),
    neckFlexion: new AngleAccumulator(),
    shoulderElevation: new AngleAccumulator(),
    elbowAngle: new AngleAccumulator(),
    kneeAngle: new AngleAccumulator(),
  });
  const lastWarningRef = useRef<string>('');
  // Se detectForVideo va in eccezione (contesto GPU perso a runtime) si
  // ripiega su CPU una sola volta; se continua a fallire si arrende con un
  // errore visibile invece di restare bloccati senza alcun frame analizzato.
  const gpuFallbackTriedRef = useRef(false);
  const consecutiveErrorsRef = useRef(0);
  const MAX_CONSECUTIVE_ERRORS = 10;

  /* ------------------------------------------------------- caricamento modelli */

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setStatus('loading');
      try {
        const vision = await import('@mediapipe/tasks-vision');
        const fileset = await vision.FilesetResolver.forVisionTasks(WASM_BASE);
        if (cancelled) return;

        // Alcune WebView embedded (in particolare quella di Telegram su
        // Android) rifiutano o rompono silenziosamente il delegate GPU di
        // MediaPipe: il modello si crea ma non rileva mai nulla. Si tenta
        // prima la GPU e, se la creazione fallisce, si ripiega su CPU -
        // piu' lenta ma compatibile ovunque.
        const createWithFallback = async <T>(
          label: string,
          factory: (delegate: 'GPU' | 'CPU') => Promise<T>,
        ): Promise<T> => {
          try {
            return await factory('GPU');
          } catch (err) {
            console.warn(`${label}: delegate GPU non disponibile, ripiego su CPU.`, err);
            return factory('CPU');
          }
        };

        poseRef.current = await createWithFallback('PoseLandmarker', (delegate) =>
          vision.PoseLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: POSE_MODEL, delegate },
            runningMode: 'VIDEO',
            numPoses: 1,
            minPoseDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5,
          }),
        );

        if (enableFace && !cancelled) {
          faceRef.current = await createWithFallback('FaceLandmarker', (delegate) =>
            vision.FaceLandmarker.createFromOptions(fileset, {
              baseOptions: { modelAssetPath: FACE_MODEL, delegate },
              runningMode: 'VIDEO',
              numFaces: 1,
            }),
          );
        }

        if (enableHand && !cancelled) {
          handRef.current = await createWithFallback('HandLandmarker', (delegate) =>
            vision.HandLandmarker.createFromOptions(fileset, {
              baseOptions: { modelAssetPath: HAND_MODEL, delegate },
              runningMode: 'VIDEO',
              numHands: 2,
            }),
          );
        }

        if (!cancelled) setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error
            ? `Caricamento modelli fallito: ${err.message}`
            : 'Caricamento modelli fallito',
        );
        setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      poseRef.current?.close();
      faceRef.current?.close();
      handRef.current?.close();
      poseRef.current = null;
      faceRef.current = null;
      handRef.current = null;
    };
  }, [enableFace, enableHand]);

  /* --------------------------------------------------------------- risultato */

  const collect = useCallback((): PoseData => {
    const accumulators = accumulatorsRef.current;
    const elapsedSeconds =
      startedAtRef.current === 0 ? 0 : (performance.now() - startedAtRef.current) / 1000;

    const grips = gripCountsRef.current;
    const dominantGrip = Object.entries(grips).sort((a, b) => b[1] - a[1])[0]?.[0];

    const data: PoseData = {
      trunk_flexion_deg: accumulators.trunkFlexion.stats(),
      trunk_twist_deg: accumulators.trunkTwist.stats(),
      neck_flexion_deg: accumulators.neckFlexion.stats(),
      shoulder_elevation_deg: accumulators.shoulderElevation.stats(),
      elbow_angle_deg: accumulators.elbowAngle.stats(),
      knee_angle_deg: accumulators.kneeAngle.stats(),
      samples: accumulators.trunkFlexion.count,
      fps: elapsedSeconds > 0 ? Math.round(frameCountRef.current / elapsedSeconds) : 0,
    };

    if (confidenceRef.current.count > 0) {
      data.landmark_confidence =
        Math.round((confidenceRef.current.sum / confidenceRef.current.count) * 100) / 100;
    }
    if (dominantGrip) data.hand_grip = dominantGrip as PoseData['hand_grip'];

    const fatigue = fatigueRef.current.result(elapsedSeconds);
    if (fatigue) data.ear = fatigue;

    return data;
  }, []);

  const reset = useCallback(() => {
    accumulatorsRef.current = {
      trunkFlexion: new AngleAccumulator(),
      trunkTwist: new AngleAccumulator(),
      neckFlexion: new AngleAccumulator(),
      shoulderElevation: new AngleAccumulator(),
      elbowAngle: new AngleAccumulator(),
      kneeAngle: new AngleAccumulator(),
    };
    fatigueRef.current = new FatigueTracker();
    gripCountsRef.current = {};
    confidenceRef.current = { sum: 0, count: 0 };
    frameCountRef.current = 0;
    startedAtRef.current = 0;
    lastVideoTimeRef.current = -1;
    lastWarningRef.current = '';
    gpuFallbackTriedRef.current = false;
    consecutiveErrorsRef.current = 0;
    setLive(EMPTY_LIVE);
  }, []);

  /* ------------------------------------------------------------- ciclo video */

  const stop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setStatus((current) => (current === 'running' ? 'ready' : current));
  }, []);

  const tick = useCallback(() => {
    const video = videoRef.current;
    const landmarker = poseRef.current;
    if (!video || !landmarker || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }

    const now = performance.now();
    let elapsed = startedAtRef.current === 0 ? 0 : now - startedAtRef.current;

    // detectForVideo va chiamato una sola volta per frame sorgente.
    if (video.currentTime !== lastVideoTimeRef.current) {
      lastVideoTimeRef.current = video.currentTime;
      frameCountRef.current += 1;

      let angles: PoseAngles | null = null;
      let warnings: LiveWarning[] = [];
      let screen: Landmark[] | undefined;

      try {
        const result = landmarker.detectForVideo(video, now);
        const world = result.worldLandmarks?.[0] as Landmark[] | undefined;
        screen = result.landmarks?.[0] as Landmark[] | undefined;

        if (world && screen) {
          // La visibilita' sta nei landmark normalizzati: si combinano i due set.
          const enriched = world.map((point, index) => ({
            ...point,
            visibility: screen?.[index]?.visibility ?? 1,
          }));
          angles = computeAngles(enriched);
        }

        if (angles) {
          const accumulators = accumulatorsRef.current;
          accumulators.trunkFlexion.push(angles.trunkFlexion);
          accumulators.trunkTwist.push(angles.trunkTwist);
          accumulators.neckFlexion.push(angles.neckFlexion);
          accumulators.shoulderElevation.push(angles.shoulderElevation);
          accumulators.elbowAngle.push(angles.elbowAngle);
          accumulators.kneeAngle.push(angles.kneeAngle);
          confidenceRef.current.sum += angles.confidence;
          confidenceRef.current.count += 1;

          warnings = liveWarnings(angles, limits);
          const signature = warnings.map((w) => w.code).join(',');
          if (signature && signature !== lastWarningRef.current) {
            warnings.forEach((warning) => onWarning?.(warning));
          }
          lastWarningRef.current = signature;
        }

        if (faceRef.current) {
          const face = faceRef.current.detectForVideo(video, now).faceLandmarks?.[0];
          if (face) fatigueRef.current.push(face as Landmark[]);
        }

        if (handRef.current) {
          const hands = handRef.current.detectForVideo(video, now).landmarks;
          const grip = hands?.[0] ? classifyGrip(hands[0] as Landmark[]) : undefined;
          if (grip) {
            gripCountsRef.current[grip] = (gripCountsRef.current[grip] ?? 0) + 1;
          }
        }

        consecutiveErrorsRef.current = 0;
      } catch (err) {
        // Senza questo catch un'eccezione qui (tipico di un contesto GPU
        // perso a meta' sessione in una WebView embedded) interrompe per
        // sempre il ciclo requestAnimationFrame: l'app resta aperta ma non
        // analizza piu' nessun frame, senza mostrare alcun errore.
        consecutiveErrorsRef.current += 1;
        console.error('Rilevamento del frame fallito', err);

        if (!gpuFallbackTriedRef.current) {
          gpuFallbackTriedRef.current = true;
          landmarker.setOptions({ baseOptions: { delegate: 'CPU' } }).catch((fallbackErr) => {
            console.error('Ripiego su CPU fallito', fallbackErr);
          });
        }

        if (consecutiveErrorsRef.current >= MAX_CONSECUTIVE_ERRORS) {
          stop();
          setStatus('error');
          setError(
            'Rilevamento non riuscito su questo dispositivo. Riprova, oppure apri la Mini App in un altro browser.',
          );
          return;
        }
      }

      // Il cronometro parte qui: il primo frame analizzato e' il momento in
      // cui l'analisi e' davvero operativa.
      if (startedAtRef.current === 0) startedAtRef.current = performance.now();
      elapsed = performance.now() - startedAtRef.current;

      setLive({
        angles,
        warnings,
        landmarks: screen ?? null,
        fps: elapsed > 0 ? Math.round((frameCountRef.current / elapsed) * 1000) : 0,
        progress: Math.min(elapsed / durationMs, 1),
      });
    }

    if (startedAtRef.current === 0 && now - launchedAtRef.current > WARMUP_TIMEOUT_MS) {
      stop();
      setStatus('error');
      setError(
        'Nessun frame analizzabile: verifica che la camera inquadri la scena e riprova.',
      );
      return;
    }

    if (startedAtRef.current !== 0 && elapsed >= durationMs) {
      stop();
      setStatus('done');
      onComplete?.(collect(), elapsed / 1000);
      return;
    }

    rafRef.current = requestAnimationFrame(tick);
  }, [collect, durationMs, limits, onComplete, onWarning, stop, videoRef]);

  const start = useCallback(() => {
    if (!poseRef.current) return;
    reset();
    setError(null);
    launchedAtRef.current = performance.now();
    setStatus('running');
    rafRef.current = requestAnimationFrame(tick);
  }, [reset, tick]);

  return { status, error, live, start, stop, reset, collect };
}
