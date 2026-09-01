# SEGNO Mini App — POC (Week 1-3)

Implementazione del primo gradino della roadmap in [`docs/PRD.md`](../../docs/PRD.md):
un POC di traduzione di segni statici della LIS usando MediaPipe
Holistic, eseguibile come Telegram Mini App.

## Cosa fa questo POC

- Accede alla webcam del dispositivo e ne esegue il tracking con
  `HolisticLandmarker` di MediaPipe Tasks Vision, interamente on-device
  (WASM/WebGL).
- Riconosce un piccolo vocabolario di segni statici a una mano
  (`src/vision/signs.ts`) tramite un classificatore euristico basato sulla
  geometria delle dita (`src/vision/classifier.ts`).
- Mostra la trascrizione in italiano e la legge ad alta voce con la Web
  Speech API del browser.
- Si integra con l'SDK WebApp di Telegram (tema, feedback aptico,
  CloudStorage) quando eseguita dentro Telegram, e funziona anche in un
  browser normale per lo sviluppo.

## Cosa NON fa (ancora)

Il classificatore euristico su singola mano è un placeholder per la
pipeline descritta in PRD §5 (30 frame di landmark → LSTM TFLite →
glossa → frase), che richiede il modello `lis_classifier.tflite`
addestrato sul dataset di PRD §7. Non è ancora presente: il supporto
LiDAR (PRD §5, §9), il bot Telegram lato server e il bottone "Traduci"
sotto ai video (PRD §4, §6), né la traduzione inversa vocale → avatar
(PRD §5).

## Sviluppo locale

```bash
npm install
npm run dev
```

Apri l'URL stampato da Vite in un browser con accesso alla webcam
(richiede HTTPS o `localhost`).

```bash
npm run build   # build di produzione in dist/
npm run lint    # solo type-check
```

## Struttura

```
src/
  telegram.ts           wrapper sull'SDK Telegram WebApp
  vision/
    holistic.ts          wrapper su MediaPipe HolisticLandmarker
    classifier.ts         buffer landmark + classificatore euristico
    signs.ts               vocabolario segni del POC
  components/
    CameraView.tsx         webcam + loop di inferenza + overlay landmark
    TranscriptPanel.tsx     trascrizione + sintesi vocale
  App.tsx, main.tsx, styles.css
```
