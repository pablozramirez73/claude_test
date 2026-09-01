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
  const startedAtRef = useRef(0);
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

  /* ------------------------------------------------------- caricamento modelli */

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setStatus('loading');
      try {
        const vision = await import('@mediapipe/tasks-vision');
        const fileset = await vision.FilesetResolver.forVisionTasks(WASM_BASE);
        if (cancelled) return;

        poseRef.current = await vision.PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: POSE_MODEL, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        if (enableFace && !cancelled) {
          faceRef.current = await vision.FaceLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: FACE_MODEL, delegate: 'GPU' },
            runningMode: 'VIDEO',
            numFaces: 1,
          });
        }

        if (enableHand && !cancelled) {
          handRef.current = await vision.HandLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: HAND_MODEL, delegate: 'GPU' },
            runningMode: 'VIDEO',
            numHands: 2,
          });
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
    const elapsedSeconds = (performance.now() - startedAtRef.current) / 1000;

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
    lastVideoTimeRef.current = -1;
    lastWarningRef.current = '';
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
    const elapsed = now - startedAtRef.current;

    // detectForVideo va chiamato una sola volta per frame sorgente.
    if (video.currentTime !== lastVideoTimeRef.current) {
      lastVideoTimeRef.current = video.currentTime;
      frameCountRef.current += 1;

      const result = landmarker.detectForVideo(video, now);
      const world = result.worldLandmarks?.[0] as Landmark[] | undefined;
      const screen = result.landmarks?.[0] as Landmark[] | undefined;

      let angles: PoseAngles | null = null;
      if (world && screen) {
        // La visibilita' sta nei landmark normalizzati: si combinano i due set.
        const enriched = world.map((point, index) => ({
          ...point,
          visibility: screen[index]?.visibility ?? 1,
        }));
        angles = computeAngles(enriched);
      }

      let warnings: LiveWarning[] = [];
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

      setLive({
        angles,
        warnings,
        landmarks: screen ?? null,
        fps: elapsed > 0 ? Math.round((frameCountRef.current / elapsed) * 1000) : 0,
        progress: Math.min(elapsed / durationMs, 1),
      });
    }

    if (elapsed >= durationMs) {
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
    startedAtRef.current = performance.now();
    setStatus('running');
    rafRef.current = requestAnimationFrame(tick);
  }, [reset, tick]);

  return { status, error, live, start, stop, reset, collect };
}
