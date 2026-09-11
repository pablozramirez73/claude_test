import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from "react";

export interface CameraViewHandle {
  /** Captures the current frame as a canvas + returns it plus a data URL for storage/preview. */
  captureFrame: () => { canvas: HTMLCanvasElement; dataUrl: string } | null;
}

interface CameraViewProps {
  overlay?: ReactNode;
  onReady?: (video: HTMLVideoElement) => void;
  onError?: (message: string) => void;
}

/**
 * Live front camera preview via getUserMedia. Front camera because MISURA's
 * scan flow is a self-scan (user props the phone up and rotates in front of
 * it) — see docs/PRD-misura.md §4.
 */
export const CameraView = forwardRef<CameraViewHandle, CameraViewProps>(function CameraView(
  { overlay, onReady, onError },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [starting, setStarting] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 1280 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          onReady?.(videoRef.current);
        }
      } catch (err) {
        onError?.(err instanceof Error ? err.message : "impossibile accedere alla fotocamera");
      } finally {
        if (!cancelled) setStarting(false);
      }
    }

    start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(ref, () => ({
    captureFrame() {
      const video = videoRef.current;
      if (!video || video.videoWidth === 0) return null;
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      // Mirror horizontally to match what the user sees in the front-camera preview.
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      return { canvas, dataUrl: canvas.toDataURL("image/jpeg", 0.85) };
    },
  }));

  return (
    <div className="camera-view">
      <video ref={videoRef} className="camera-view__video" playsInline muted autoPlay />
      {starting && <div className="camera-view__loading">Avvio fotocamera…</div>}
      <div className="camera-view__overlay">{overlay}</div>
    </div>
  );
});
