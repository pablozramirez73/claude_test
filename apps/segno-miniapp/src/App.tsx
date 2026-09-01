import { useCallback, useState } from "react";
import { CameraView } from "./components/CameraView";
import { TranscriptPanel } from "./components/TranscriptPanel";
import { hapticSignDetected, saveFrequentPhrase } from "./telegram";
import type { DetectionEvent } from "./vision/classifier";

const MAX_HISTORY = 20;

export function App() {
  const [events, setEvents] = useState<DetectionEvent[]>([]);

  const handleDetection = useCallback((event: DetectionEvent) => {
    hapticSignDetected();
    setEvents((prev) => [...prev, event].slice(-MAX_HISTORY));
  }, []);

  function handleSave() {
    const sentence = events.map((e) => e.sign.italian).join(" ");
    if (sentence) saveFrequentPhrase(sentence);
  }

  return (
    <main className="app">
      <header className="app-header">
        <h1>SEGNO</h1>
        <p>Le mani parlano. Telegram le ascolta.</p>
      </header>

      <CameraView onDetection={handleDetection} />
      <TranscriptPanel events={events} />

      <div className="app-actions">
        <button type="button" onClick={() => setEvents([])} disabled={events.length === 0}>
          Cancella
        </button>
        <button type="button" onClick={handleSave} disabled={events.length === 0}>
          Salva frase
        </button>
      </div>

      <p className="privacy-note">
        Nessun frame video lascia il tuo telefono. Analizziamo solo i
        punti (landmark) della mano, on-device.
      </p>
    </main>
  );
}
