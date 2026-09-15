/** Anteprima della camera con overlay dello scheletro e badge in tempo reale. */
import { forwardRef } from 'react';

import { PoseOverlay } from './PoseOverlay';
import type { LiveState } from '../hooks/useMediapipePose';

interface Props {
  live: LiveState;
  running: boolean;
  cameraError: string | null;
}

export const CameraView = forwardRef<HTMLVideoElement, Props>(function CameraView(
  { live, running, cameraError },
  ref,
) {
  return (
    <div className="camera">
      <video ref={ref} className="camera__video" playsInline muted autoPlay />
      <PoseOverlay
        landmarks={live.landmarks}
        warnings={live.warnings}
        width={720}
        height={960}
      />

      {cameraError && (
        <div className="camera__message camera__message--error">{cameraError}</div>
      )}

      {!cameraError && !live.landmarks && (
        <div className="camera__message">
          Inquadra il lavoratore per intero: devono essere visibili spalle,
          bacino e ginocchia.
        </div>
      )}

      {running && (
        <>
          <div className="camera__progress">
            <div
              className="camera__progress-bar"
              style={{ width: `${Math.round(live.progress * 100)}%` }}
            />
          </div>
          <div className="camera__badges">
            {live.warnings.length === 0 && live.angles && (
              <span className="badge badge--ok">Postura nei limiti</span>
            )}
            {live.warnings.map((warning) => (
              <span
                key={warning.code}
                className={`badge badge--${warning.severity === 'high' ? 'high' : 'warn'}`}
              >
                {warning.label}
              </span>
            ))}
          </div>
        </>
      )}

      {live.angles && (
        <div className="camera__angles">
          <span>Schiena {Math.round(live.angles.trunkFlexion)}°</span>
          <span>Torsione {Math.round(live.angles.trunkTwist)}°</span>
          <span>Braccio {Math.round(live.angles.shoulderElevation)}°</span>
        </div>
      )}
    </div>
  );
});
