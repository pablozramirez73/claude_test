import { useState } from "react";

interface ConsentGateProps {
  onAccept: () => void;
}

/**
 * GDPR consent screen (architecture doc §10 Privacy & Compliance): explicit,
 * informed opt-in before any camera/sensor access is requested.
 */
export function ConsentGate({ onAccept }: ConsentGateProps) {
  const [checked, setChecked] = useState(false);

  return (
    <div className="consent-gate">
      <h2>Prima di iniziare</h2>
      <ul className="consent-gate__points">
        <li>La fotocamera viene usata solo per calcolare le tue misure, on-device.</li>
        <li>Nessun video o immagine lascia il telefono: l'elaborazione avviene in locale (WASM).</li>
        <li>Il frame catturato viene scartato subito dopo il calcolo: salviamo solo le misure in cm.</li>
        <li>Puoi cancellare il profilo salvato in qualsiasi momento dalla schermata Profilo.</li>
      </ul>
      <label className="consent-gate__checkbox">
        <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
        Ho letto e acconsento all'uso di fotocamera e sensori per il calcolo delle misure.
      </label>
      <button className="button button--primary" disabled={!checked} onClick={onAccept}>
        Trova la mia taglia
      </button>
    </div>
  );
}
