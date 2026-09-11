interface ScanGuideProps {
  message: string;
  stability: "checking" | "stable" | "unsupported";
  ready: boolean;
  onCapture: () => void;
  captureLabel: string;
}

/** Text + status overlay shown on top of the camera preview during a scan step. */
export function ScanGuide({ message, stability, ready, onCapture, captureLabel }: ScanGuideProps) {
  return (
    <div className="scan-guide">
      <p className="scan-guide__message">{message}</p>
      <div className={`scan-guide__stability scan-guide__stability--${stability}`}>
        {stability === "checking" && "Verifico stabilità del telefono…"}
        {stability === "stable" && "Telefono stabile ✓"}
        {stability === "unsupported" && "Sensore di movimento non disponibile — procedo comunque"}
      </div>
      <button className="button button--primary" disabled={!ready} onClick={onCapture}>
        {captureLabel}
      </button>
    </div>
  );
}
