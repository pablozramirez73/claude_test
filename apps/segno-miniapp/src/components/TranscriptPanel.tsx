import type { DetectionEvent } from "../vision/classifier";

interface TranscriptPanelProps {
  events: DetectionEvent[];
}

/**
 * Trascrizione in italiano + sintesi vocale (PRD §4, Caso A). La sintesi
 * vocale usa la Web Speech API del browser come stand-in on-device per
 * il TTS descritto in PRD §6 (`sendVoice` con audio generato
 * localmente).
 */
export function TranscriptPanel({ events }: TranscriptPanelProps) {
  const sentence = events.map((e) => e.sign.italian).join(" ");

  function speak() {
    if (!sentence || !("speechSynthesis" in window)) return;
    const utterance = new SpeechSynthesisUtterance(sentence);
    utterance.lang = "it-IT";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  return (
    <div className="transcript-panel">
      <div className="transcript-text" aria-live="polite">
        {sentence || "In attesa di un segno…"}
      </div>
      <button
        type="button"
        className="transcript-speak-btn"
        onClick={speak}
        disabled={!sentence}
      >
        🔊 Ascolta
      </button>
    </div>
  );
}
