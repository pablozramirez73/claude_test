/** Scheletro disegnato sopra il video, colorato in base ai rilievi attivi. */
import { useEffect, useRef } from 'react';

import { POSE_CONNECTIONS, type Landmark, type LiveWarning } from '../lib/ergo-calculator';

interface Props {
  landmarks: Landmark[] | null;
  warnings: LiveWarning[];
  width: number;
  height: number;
  mirrored?: boolean;
}

const COLORS = {
  ok: '#22c55e',
  warn: '#f59e0b',
  high: '#ef4444',
};

export function PoseOverlay({ landmarks, warnings, width, height, mirrored = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;

    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!landmarks) return;

    const severity = warnings.some((w) => w.severity === 'high')
      ? 'high'
      : warnings.length > 0
        ? 'warn'
        : 'ok';
    const color = COLORS[severity];

    const project = (point: Landmark) => ({
      x: (mirrored ? 1 - point.x : point.x) * canvas.width,
      y: point.y * canvas.height,
    });

    context.lineWidth = Math.max(2, canvas.width / 220);
    context.strokeStyle = color;
    context.fillStyle = color;
    context.lineCap = 'round';

    POSE_CONNECTIONS.forEach(([from, to]) => {
      const a = landmarks[from];
      const b = landmarks[to];
      if (!a || !b) return;
      if ((a.visibility ?? 1) < 0.4 || (b.visibility ?? 1) < 0.4) return;

      const start = project(a);
      const end = project(b);
      context.beginPath();
      context.moveTo(start.x, start.y);
      context.lineTo(end.x, end.y);
      context.stroke();
    });

    const radius = Math.max(3, canvas.width / 160);
    landmarks.forEach((point, index) => {
      if (index < 11 && index !== 0) return; // il volto non serve all'overlay
      if ((point.visibility ?? 1) < 0.4) return;
      const projected = project(point);
      context.beginPath();
      context.arc(projected.x, projected.y, radius, 0, Math.PI * 2);
      context.fill();
    });
  }, [landmarks, mirrored, warnings]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="pose-overlay"
      aria-hidden="true"
    />
  );
}
