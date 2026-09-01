/**
 * Acquisizione della valutazione.
 *
 * Tre fasi: verifica dei prerequisiti (sensori), scansione di 15 secondi con
 * analisi on-device, invio degli angoli aggregati al backend.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { useApp } from '../AppContext';
import { CameraView } from '../components/CameraView';
import { SensorGate, type Check } from '../components/SensorGate';
import { useAmbientLight } from '../hooks/useAmbientLight';
import { useCamera } from '../hooks/useCamera';
import { useIMUStability, recalibrateIMU } from '../hooks/useIMUStability';
import { useMediapipePose } from '../hooks/useMediapipePose';
import { useNoiseLevel } from '../hooks/useNoiseLevel';
import { ApiError, api } from '../lib/api';
import { alert as tgAlert, haptic, setMainButtonBusy, showBackButton, showMainButton } from '../lib/telegram';
import type { AssessmentType, PoseData, TaskData } from '../types';

const CAPTURE_MS = 15_000;

const DEFAULT_TASK: TaskData = {
  load_kg: 10,
  h_cm: 40,
  v_cm: 75,
  d_cm: 25,
  freq_per_min: 2,
  duration: 'MODERATE',
};

type Phase = 'setup' | 'capture' | 'sending';

export function AssessmentPage() {
  const { type = 'LIFT' } = useParams<{ type: AssessmentType }>();
  const assessmentType = type as AssessmentType;
  const navigate = useNavigate();
  const { thresholds } = useApp();

  const videoRef = useRef<HTMLVideoElement>(null);
  const [phase, setPhase] = useState<Phase>('setup');
  const [task, setTask] = useState<TaskData>(DEFAULT_TASK);
  const [workerRef, setWorkerRef] = useState('');
  const [workstation, setWorkstation] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const camera = useCamera(videoRef);
  const imu = useIMUStability(thresholds.max_tilt_deg);
  const light = useAmbientLight(thresholds.min_lux);
  const noise = useNoiseLevel(thresholds.max_noise_db);

  const limits = useMemo(
    () => ({
      trunkFlexion: thresholds.trunk_flexion_warn,
      trunkTwist: thresholds.trunk_twist_warn,
      armElevation: thresholds.arm_elevation_warn,
      neckFlexion: thresholds.neck_flexion_warn,
    }),
    [thresholds],
  );

  const submit = useCallback(
    async (poseData: PoseData, elapsedSeconds: number) => {
      setPhase('sending');
      setMainButtonBusy(true);
      try {
        const assessment = await api.createAssessment({
          type: assessmentType,
          worker_ref: workerRef,
          workstation,
          pose_data: poseData,
          task_data: assessmentType === 'LIFT' ? task : undefined,
          light_lux: light.lux,
          noise_db: noise.db,
          device_tilt_deg: imu.deviationDeg,
          duration_s: Math.round(elapsedSeconds * 10) / 10,
          frames_analyzed: poseData.samples ?? 0,
        });
        haptic.success();
        navigate(`/result/${assessment.id}`, { state: { assessment } });
      } catch (err) {
        haptic.error();
        if (err instanceof ApiError && err.isQuotaExceeded) {
          navigate('/piani', { state: { reason: err.message } });
          return;
        }
        setSubmitError(err instanceof Error ? err.message : 'Invio non riuscito');
        setPhase('setup');
      } finally {
        setMainButtonBusy(false);
      }
    },
    [assessmentType, imu.deviationDeg, light.lux, navigate, noise.db, task, workerRef, workstation],
  );

  const pose = useMediapipePose({
    videoRef,
    enableFace: assessmentType === 'PC',
    enableHand: assessmentType === 'LIFT',
    limits,
    durationMs: CAPTURE_MS,
    onComplete: submit,
    onWarning: (warning) => haptic.tap(warning.severity === 'high' ? 'heavy' : 'light'),
  });

  /* ------------------------------------------------------------ prerequisiti */

  useEffect(() => {
    void camera.start();
    void noise.start();
    void imu.requestPermission();
    return () => {
      camera.stop();
      noise.stop();
    };
    // I controller restano stabili per tutta la vita della pagina.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Senza sensore di luce dedicato si stima l'illuminamento dal video.
  useEffect(() => {
    if (light.fromSensor) return undefined;
    const timer = window.setInterval(() => light.sampleFromVideo(videoRef.current), 1000);
    return () => window.clearInterval(timer);
  }, [light]);

  const checks: Check[] = [
    {
      code: 'camera',
      label: 'Camera',
      value: camera.ready ? 'attiva' : '—',
      ok: camera.error ? false : camera.ready ? true : null,
      blocking: true,
      hint: camera.error ?? 'Concedi il permesso di accesso alla fotocamera.',
    },
    {
      code: 'model',
      label: 'Modelli di analisi',
      value: pose.status === 'ready' || pose.status === 'running' ? 'pronti' : 'caricamento…',
      ok: pose.status === 'error' ? false : pose.status === 'ready' || pose.status === 'running' ? true : null,
      blocking: true,
      hint: pose.error ?? undefined,
    },
    {
      code: 'imu',
      label: 'Stabilità dispositivo',
      value: imu.supported ? `${imu.deviationDeg.toFixed(1)}°` : 'non disponibile',
      ok: imu.supported ? imu.stable : null,
      blocking: imu.supported,
      hint: `Appoggia il telefono su un treppiede: deviazione massima ${thresholds.max_tilt_deg}°.`,
    },
    {
      code: 'light',
      label: 'Illuminamento',
      value: light.lux === null ? '—' : `${light.lux} lux${light.fromSensor ? '' : ' (stima)'}`,
      ok: light.compliant,
      blocking: false,
      hint: `Sotto ${thresholds.min_lux} lux la postazione non è conforme (All. XXXIV).`,
    },
    {
      code: 'noise',
      label: 'Rumore',
      value: noise.db === null ? '—' : `${noise.db} dB(A)`,
      ok: noise.compliant,
      blocking: false,
      hint: `Oltre ${thresholds.max_noise_db} dB(A) scatta il valore inferiore di azione.`,
    },
  ];

  const blocked = checks.some((check) => check.blocking && check.ok !== true);

  /* ------------------------------------------------------------- main button */

  useEffect(() => showBackButton(() => navigate(-1)), [navigate]);

  useEffect(() => {
    if (phase === 'sending') return undefined;
    if (phase === 'capture') {
      return showMainButton('Interrompi', () => {
        pose.stop();
        setPhase('setup');
      });
    }
    return showMainButton(blocked ? 'Prerequisiti non soddisfatti' : 'Avvia scansione 15 s', () => {
      if (blocked) {
        tgAlert('Completa i prerequisiti in rosso prima di avviare la scansione.');
        return;
      }
      haptic.tap('medium');
      setPhase('capture');
      pose.start();
    });
  }, [blocked, phase, pose, navigate]);

  /* -------------------------------------------------------------------- vista */

  return (
    <div className="page page--capture">
      <CameraView ref={videoRef} live={pose.live} running={phase === 'capture'} cameraError={camera.error} />

      {phase === 'sending' && <div className="loader">Calcolo del punteggio…</div>}

      {phase === 'setup' && (
        <>
          {submitError && <div className="alert alert--error">{submitError}</div>}

          <SensorGate checks={checks} />

          {imu.supported && !imu.stable && (
            <button className="button button--ghost" onClick={recalibrateIMU}>
              Ricalibra posizione telefono
            </button>
          )}

          <h2 className="section-title">Dati del compito</h2>
          <div className="form">
            <label className="field">
              <span>Riferimento lavoratore</span>
              <input
                value={workerRef}
                onChange={(event) => setWorkerRef(event.target.value)}
                placeholder="es. MAG-014"
                maxLength={64}
              />
              <small>Usa un codice pseudonimo, non il nome del lavoratore.</small>
            </label>

            <label className="field">
              <span>Postazione</span>
              <input
                value={workstation}
                onChange={(event) => setWorkstation(event.target.value)}
                placeholder="es. Baia di carico 2"
                maxLength={120}
              />
            </label>

            {assessmentType === 'LIFT' && (
              <TaskForm task={task} onChange={setTask} />
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** Parametri geometrici richiesti dall'equazione NIOSH. */
function TaskForm({ task, onChange }: { task: TaskData; onChange: (task: TaskData) => void }) {
  const update = (patch: Partial<TaskData>) => onChange({ ...task, ...patch });

  return (
    <>
      <label className="field">
        <span>Peso del carico (kg)</span>
        <input
          type="number"
          inputMode="decimal"
          min={0.1}
          max={200}
          step={0.5}
          value={task.load_kg ?? ''}
          onChange={(event) => update({ load_kg: Number(event.target.value) })}
        />
      </label>

      <label className="field">
        <span>Distanza orizzontale mani-caviglie H (cm)</span>
        <input
          type="number"
          min={10}
          max={80}
          value={task.h_cm ?? ''}
          onChange={(event) => update({ h_cm: Number(event.target.value) })}
        />
      </label>

      <label className="field">
        <span>Altezza delle mani da terra V (cm)</span>
        <input
          type="number"
          min={0}
          max={200}
          value={task.v_cm ?? ''}
          onChange={(event) => update({ v_cm: Number(event.target.value) })}
        />
      </label>

      <label className="field">
        <span>Dislocazione verticale D (cm)</span>
        <input
          type="number"
          min={0}
          max={200}
          value={task.d_cm ?? ''}
          onChange={(event) => update({ d_cm: Number(event.target.value) })}
        />
      </label>

      <label className="field">
        <span>Frequenza (sollevamenti/min)</span>
        <input
          type="number"
          min={0.2}
          max={15}
          step={0.1}
          value={task.freq_per_min ?? ''}
          onChange={(event) => update({ freq_per_min: Number(event.target.value) })}
        />
      </label>

      <label className="field">
        <span>Durata del compito</span>
        <select
          value={task.duration ?? 'MODERATE'}
          onChange={(event) => update({ duration: event.target.value as TaskData['duration'] })}
        >
          <option value="SHORT">Fino a 1 ora</option>
          <option value="MODERATE">Da 1 a 2 ore</option>
          <option value="LONG">Da 2 a 8 ore</option>
        </select>
      </label>

      <p className="muted small">
        L'angolo di asimmetria e la qualità della presa vengono rilevati
        automaticamente durante la scansione.
      </p>
    </>
  );
}
