import { useEffect, useState } from "react";
import { estimateCircumference } from "../measure/anthropometry";
import { detectBodyLandmarks } from "../vision/pose";
import { segmentSilhouette, silhouetteWidthAtRow } from "../vision/segmentation";
import { useScan } from "../state/ScanContext";

/**
 * Where the waist row sits between the shoulder line (0.0) and the hip line
 * (1.0). Average adult torso proportions put the natural waist noticeably
 * closer to the hips than to the shoulders.
 */
const WAIST_ROW_T = 0.62;

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("impossibile caricare il frame catturato"));
    img.src = dataUrl;
  });
}

export function ProcessingScreen() {
  const { state, dispatch } = useScan();
  const [statusMessage, setStatusMessage] = useState("Avvio pipeline MediaPipe (on-device)…");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!state.bodyFrameDataUrl || !state.calibration) {
        dispatch({ type: "SET_ERROR", error: "dati di scansione mancanti, riprova." });
        dispatch({ type: "GOTO", step: "scan" });
        return;
      }

      try {
        const image = await loadImage(state.bodyFrameDataUrl);
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("canvas non disponibile");
        ctx.drawImage(image, 0, 0);

        if (cancelled) return;
        setStatusMessage("Rilevo i landmark corporei (PoseLandmarker)…");
        const landmarks = await detectBodyLandmarks(canvas);
        if (!landmarks) throw new Error("corpo non rilevato nel frame — assicurati di essere ben visibile e riprova.");

        if (cancelled) return;
        setStatusMessage("Isolo la silhouette (ImageSegmenter)…");
        const mask = await segmentSilhouette(canvas);
        if (!mask) throw new Error("silhouette non rilevata — sfondo troppo simile o luce insufficiente.");

        if (cancelled) return;
        setStatusMessage("Calcolo le misure…");

        const chestRowY = (landmarks.leftShoulder.y + landmarks.rightShoulder.y) / 2;
        const hipsRowY = (landmarks.leftHip.y + landmarks.rightHip.y) / 2;
        const waistRowY = chestRowY + (hipsRowY - chestRowY) * WAIST_ROW_T;

        const chestWidthPx = silhouetteWidthAtRow(mask, chestRowY);
        const waistWidthPx = silhouetteWidthAtRow(mask, waistRowY);
        const hipsWidthPx = silhouetteWidthAtRow(mask, hipsRowY);

        if (!chestWidthPx || !waistWidthPx || !hipsWidthPx) {
          throw new Error("misura non riuscita per uno dei punti corpo — riprova con più luce/distanza.");
        }

        const chest = estimateCircumference(chestWidthPx, state.calibration, "chest");
        const waist = estimateCircumference(waistWidthPx, state.calibration, "waist");
        const hips = estimateCircumference(hipsWidthPx, state.calibration, "hips");

        if (cancelled) return;
        dispatch({
          type: "SET_MEASUREMENTS",
          measurements: {
            chest: Math.round(chest.circumferenceCm * 10) / 10,
            waist: Math.round(waist.circumferenceCm * 10) / 10,
            hips: Math.round(hips.circumferenceCm * 10) / 10,
          },
        });
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "elaborazione fallita";
        dispatch({ type: "SET_ERROR", error: message });
        dispatch({ type: "GOTO", step: "scan" });
      }
    }

    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="screen screen--processing">
      <div className="spinner" aria-hidden />
      <p>{statusMessage}</p>
      <p className="processing__hint">Tutto avviene sul telefono — nessuna immagine viene inviata a un server.</p>
    </div>
  );
}
