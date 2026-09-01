import { useEffect, useRef, useState } from "react";
import { CameraView, type CameraViewHandle } from "../components/CameraView";
import { ScanGuide } from "../components/ScanGuide";
import { calibrateFromCreditCard, CREDIT_CARD_HEIGHT_MM, CREDIT_CARD_WIDTH_MM } from "../measure/calibration";
import { detectDepthCapability, sampleMetricDepth } from "../sensors/depth";
import { requestMotionPermission, waitForStableDevice } from "../sensors/motion";
import { useScan } from "../state/ScanContext";

/** Fraction of the captured frame's width the credit-card guide outline occupies. */
const GUIDE_BOX_WIDTH_FRACTION = 0.45;
const CARD_ASPECT = CREDIT_CARD_HEIGHT_MM / CREDIT_CARD_WIDTH_MM;

type Phase = "detecting-depth" | "calibrate-card" | "position" | "capture-ready" | "error";

export function ScanScreen() {
  const { dispatch } = useScan();
  const cameraRef = useRef<CameraViewHandle | null>(null);
  const [phase, setPhase] = useState<Phase>("detecting-depth");
  const [stability, setStability] = useState<"checking" | "stable" | "unsupported">("checking");
  const [note, setNote] = useState<string | null>(null);

  // On mount: try the real depth path first, fall back to the credit-card
  // calibration flow (docs/PRD-misura.md §9/§11) — and say which one we're using.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const capability = await detectDepthCapability();
      if (cancelled) return;
      if (!capability.supported) {
        setNote(`Profondità LiDAR non disponibile (${capability.reason}). Uso calibrazione con carta.`);
        setPhase("calibrate-card");
        return;
      }
      try {
        await sampleMetricDepth();
        // Not reachable in this POC (sampleMetricDepth() always throws — see
        // sensors/depth.ts) but kept so the real device path drops in cleanly.
        setPhase("position");
      } catch {
        setNote("LiDAR rilevato ma la lettura di profondità non è ancora attiva in questo POC. Uso calibrazione con carta.");
        setPhase("calibrate-card");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (phase !== "position") return;
    let cancelled = false;
    (async () => {
      await requestMotionPermission();
      setStability("checking");
      try {
        await waitForStableDevice();
        if (!cancelled) setStability("stable");
      } catch {
        if (!cancelled) setStability("unsupported");
      } finally {
        if (!cancelled) setPhase("capture-ready");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase]);

  function handleCameraError(message: string) {
    setNote(message);
    setPhase("error");
    dispatch({ type: "SET_ERROR", error: message });
  }

  function handleCalibrationCapture() {
    const frame = cameraRef.current?.captureFrame();
    if (!frame) return;
    const cardPixelWidth = frame.canvas.width * GUIDE_BOX_WIDTH_FRACTION;
    try {
      const calibration = calibrateFromCreditCard(cardPixelWidth);
      dispatch({ type: "SET_CALIBRATION", calibration });
      setPhase("position");
    } catch (err) {
      handleCameraError(err instanceof Error ? err.message : "calibrazione fallita");
    }
  }

  function handleBodyCapture() {
    const frame = cameraRef.current?.captureFrame();
    if (!frame) return;
    dispatch({ type: "SET_BODY_FRAME", dataUrl: frame.dataUrl });
  }

  const guideBoxHeightFraction = GUIDE_BOX_WIDTH_FRACTION * CARD_ASPECT;

  return (
    <div className="screen screen--scan">
      {note && <p className="scan-note">{note}</p>}

      {phase === "calibrate-card" && (
        <CameraView
          ref={cameraRef}
          onError={handleCameraError}
          overlay={
            <>
              <div
                className="card-guide"
                style={{ width: `${GUIDE_BOX_WIDTH_FRACTION * 100}%`, height: `${guideBoxHeightFraction * 100}%` }}
              />
              <ScanGuide
                message="Appoggia una carta (bancomat/credito) a terra e allineala al riquadro."
                stability="unsupported"
                ready
                captureLabel="Ho allineato la carta"
                onCapture={handleCalibrationCapture}
              />
            </>
          }
        />
      )}

      {(phase === "position" || phase === "capture-ready") && (
        <CameraView
          ref={cameraRef}
          onError={handleCameraError}
          overlay={
            <ScanGuide
              message="Allontanati 2-2.5m dal telefono e gira lentamente su te stesso."
              stability={stability}
              ready={phase === "capture-ready"}
              captureLabel="Scatta"
              onCapture={handleBodyCapture}
            />
          }
        />
      )}

      {phase === "detecting-depth" && <p>Verifico il sensore di profondità del device…</p>}
      {phase === "error" && <p className="error">Si è verificato un problema con la fotocamera. Riprova.</p>}
    </div>
  );
}
