import { useEffect, useRef, useState } from "react";
import { detectFrame } from "../vision/holistic";
import { SignClassifier, type DetectionEvent } from "../vision/classifier";

interface CameraViewProps {
  onDetection: (event: DetectionEvent) => void;
}

/**
 * Cattura webcam + loop di inferenza Holistic (PRD §5). Nessun frame
 * lascia mai il dispositivo: il `<video>` è solo l'ingresso locale del
 * modello WASM (PRD §10).
 */
export function CameraView({ onDetection }: CameraViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const classifierRef = useRef(new SignClassifier());
  const [status, setStatus] = useState<"idle" | "starting" | "running" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let animationFrame: number;
    let cancelled = false;

    async function start() {
      setStatus("starting");
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: false,
        });
        if (cancelled || !videoRef.current) return;

        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setStatus("running");
        loop();
      } catch (err) {
        setStatus("error");
        setErrorMessage(
          err instanceof Error ? err.message : "Accesso alla camera negato.",
        );
      }
    }

    function loop() {
      animationFrame = requestAnimationFrame(async () => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (video && canvas && video.readyState >= 2) {
          const result = await detectFrame(video, performance.now());
          drawOverlay(canvas, video, result);

          // Preferisce la mano destra; usa la sinistra come fallback
          // (PRD §5 — left/right hand landmarks). Holistic riporta al
          // più una mano per lato, ma l'API la espone come array.
          const hand = result.rightHandLandmarks[0] ?? result.leftHandLandmarks[0];
          const detection = classifierRef.current.pushFrame(
            hand,
            performance.now(),
          );
          if (detection) onDetection(detection);
        }
        if (!cancelled) loop();
      });
    }

    start();

    return () => {
      cancelled = true;
      cancelAnimationFrame(animationFrame);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [onDetection]);

  return (
    <div className="camera-view">
      <video ref={videoRef} playsInline muted className="camera-video" />
      <canvas ref={canvasRef} className="camera-overlay" />
      {status === "starting" && <p className="camera-status">Avvio camera…</p>}
      {status === "error" && (
        <p className="camera-status camera-status--error">
          {errorMessage ?? "Impossibile accedere alla camera."}
        </p>
      )}
    </div>
  );
}

function drawOverlay(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  result: Awaited<ReturnType<typeof detectFrame>>,
) {
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#39ff88";

  const hands = [...result.leftHandLandmarks, ...result.rightHandLandmarks];
  for (const hand of hands) {
    for (const point of hand) {
      ctx.beginPath();
      ctx.arc(point.x * canvas.width, point.y * canvas.height, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
