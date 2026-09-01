# SEGNO — Traduttore LIS Real-Time per Telegram

**Tagline:** Le mani parlano. Telegram le ascolta.

**Verticale:** Accessibility / AI / Comunicazione / Telegram Mini App

**Stato:** Prima stesura – MVP Concept

> Questo documento è la specifica di prodotto (PRD) originale di SEGNO. La
> versione 1 del codice in questa repository (`apps/segno-miniapp`)
> implementa il primo gradino della roadmap (§11, Week 1-3): un POC di
> traduzione di segni statici con MediaPipe Holistic, come Mini App
> Telegram autonoma. Le sezioni su LiDAR, backend, dataset e
> monetizzazione restano riferimento per le fasi successive.

## 1. Elevator Pitch

SEGNO è una Mini App di Telegram che traduce la Lingua dei Segni Italiana
(LIS) in testo e voce in tempo reale, direttamente dentro le chat. Usa
MediaPipe Holistic per capire mani, viso e postura, e il LiDAR per non
confondersi quando le mani si incrociano veloci. Tutto on-device.

## 2. Problema & Opportunità

- In Italia 40.000 persone usano la LIS come prima lingua.
- Su Telegram, video-messaggi e videochiamate sono inaccessibili senza
  interprete.
- Le soluzioni esistenti richiedono app esterne, costose e che mandano
  video in cloud.

## 3. Soluzione

Un traduttore che vive DENTRO Telegram, come una Mini App. Zero app
esterne. Zero cloud per il video. Privacy totale.

## 4. User Journey

**Caso A — Video Messaggio:**

1. Utente sordo registra video-messaggio in LIS nel gruppo.
2. Bot aggiunge bottone "Traduci con SEGNO".
3. Mini App si apre, analizza il video con MediaPipe.
4. Output: trascrizione in italiano + sintesi vocale.
5. Chiunque nel gruppo può leggere/ascoltare.

**Caso B — Live:**

1. Durante una chiamata, attivi SEGNO come filtro.
2. Parli in LIS davanti alla camera.
3. I tuoi segni appaiono come sottotitoli live per gli altri partecipanti.

## 5. Architettura Tecnica

### Frontend Mini App

- React + Telegram WebApp SDK
- UI ad alto contrasto, feedback aptico per conferma segno rilevato

### Core Vision — MediaPipe Holistic è tutto

`HolisticLandmarker`:

- `face_landmarks` (468 punti): fondamentale in LIS, sopracciglia e bocca
  cambiano il significato.
- `left_hand_landmarks` + `right_hand_landmarks` (21 punti cad.): forma
  della mano.
- `pose_landmarks` (33 punti): posizione spalle/busto.

Pipeline: Sequenza di landmark (30 frame) → TensorFlow Lite LSTM
Classifier → Glossa LIS → Frase in italiano.

Modelli: `holistic_landmarker.task` + modello custom `lis_classifier.tflite`
addestrato su dataset WLIS + video propri.

### Sensor Layer — Dove il LiDAR fa la differenza

- **LiDAR Depth:** il problema più grande della LIS è l'occlusione: mani
  che si incrociano, mano davanti al viso. La camera RGB vede un blob. La
  mappa di profondità LiDAR separa in Z le due mani con precisione
  millimetrica, permettendo al tracker di non perdere l'ID mano.
- **Giroscopio + Accelerometro:** stabilizzazione elettronica. Se
  l'utente tiene il telefono in mano con l'altra, il video trema. Il
  sensore compensa i landmark.
- **TrueDepth:** migliora il Face Mesh per le micro-espressioni.
- **Microfono:** per traduzione inversa (STT per chi parla → avatar 3D
  che segna). Futuro step.

### Backend (Leggero)

- Solo per aggiornare il modello `lis_classifier`. Nessun video caricato.
- Federated Learning opzionale: gli utenti possono donare landmark
  anonimizzati (non video) per migliorare il modello.

## 6. Integrazione Telegram

- `WebApp.BiometricManager` per accesso rapido sicuro.
- Bot API: `sendVoice` con traduzione vocale generata on-device (Web
  Speech API).
- Funziona come Attachment Menu: integrabile direttamente nella barra di
  scrittura di Telegram.
- Salvataggio in `CloudStorage` delle frasi frequenti dell'utente.

## 7. Dataset & Training

- **Fase 1 MVP:** 50 segni base (ciao, grazie, aiuto, sì/no, parole
  comuni Telegram).
- **Dataset:** WLIS + 1000 video registrati con iPhone LiDAR per avere
  ground truth depth.
- **Training:** MediaPipe Model Maker per fine-tuning.

## 8. Stack Tecnico MVP

- MediaPipe Tasks Vision (Holistic) WASM
- TensorFlow Lite per classificazione sequenze
- Capacitor plugin per accesso ARKit Depth su iOS
- Hosting: Vercel (solo UI, modelli scaricati on-demand)

## 9. Fallback senza LiDAR

Se LiDAR assente, si attiva Handedness Heuristic + tracking temporale per
mantenere ID mano. Precisione scende dal 94% al 87% su segni con
incrocio, ma resta usabile.

Su Android: usa depth da doppia camera se presente.

## 10. Privacy — Punto Chiave

- Dichiarazione esplicita: "Nessun frame video lascia il tuo telefono.
  Analizziamo solo 543 puntini bianchi (landmark)".
- Cruciale per adozione da parte della comunità sorda.
- Open Source del modulo landmark per audit.

## 11. Roadmap

- **Week 1-3:** POC traduzione 20 segni statici con Holistic.
- **Week 4-5:** aggiunta LiDAR depth per disambiguazione + raccolta
  dataset con iPhone.
- **Week 6-7:** integrazione Mini App Telegram + bottone "Traduci" sotto
  ai video.
- **Week 8:** test con ENS (Ente Nazionale Sordi) sezione locale.
- **Month 3:** traduzione frasi complete + voce.

## 12. Monetizzazione & Sostenibilità

- Modello No-Profit / Freemium etico.
- Gratis per utenti finali.
- A pagamento per aziende/PA che vogliono integrarlo nei loro bot di
  supporto (es: Comune di Napoli bot accessibile) → 99€/mese.
- Candidabile a bandi EU Accessibility Act 2025, PNRR inclusione.
- Donazioni via Telegram Stars.
