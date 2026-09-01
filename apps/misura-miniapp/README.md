# MISURA — mini app

Telegram Mini App: stima le misure corporee reali (petto/vita/fianchi) da una
webcam scan + MediaPipe, con scala metrica da WebXR Depth Sensing (LiDAR) o,
in fallback, da una calibrazione a carta di credito. Vedi
[`docs/PRD-misura.md`](../../docs/PRD-misura.md) alla radice del repo per lo
spec completo del prodotto.

## Flusso

`Consenso GDPR` → `Scan (calibrazione + rotazione)` → `Elaborazione MediaPipe`
→ `Risultati + taglia consigliata + avatar 3D` → `Profilo (CloudStorage +
link di condivisione)`.

## Sviluppo locale

```bash
npm install
npm run dev       # apre in una tab browser normale, fuori da Telegram
npm run lint       # tsc --noEmit
npm run test       # vitest — matematica di misurazione (measure/*.test.ts)
npm run build      # tsc -b && vite build
```

Fuori da Telegram l'app funziona lo stesso: `telegram/webapp.ts` degrada a
`localStorage` quando `window.Telegram` non è definito, così l'intero flusso
(inclusa la webcam del laptop come stand-in per la fotocamera del telefono)
è testabile in un browser qualsiasi.

## Cosa è reale in questo POC e cosa è un fallback dichiarato

- **Reale**: cattura webcam, controllo di stabilità da `DeviceMotionEvent`,
  pipeline MediaPipe (`PoseLandmarker` + `ImageSegmenter`, entrambi via WASM
  da CDN), calcolo antropometrico (ellisse di Ramanujan), calibrazione a
  carta di credito, integrazione Telegram WebApp SDK.
- **Feature-detected con fallback esplicito**: WebXR Depth Sensing
  (`sensors/depth.ts`) — la capability viene rilevata correttamente, ma il
  loop di lettura frame-by-frame della profondità non è implementato in
  questo POC (richiede un device LiDAR reale per essere verificato); quando
  non disponibile o non ancora attivo, l'app passa automaticamente e in modo
  trasparente alla calibrazione a carta di credito.

## Note tecniche

- `measure/anthropometry.ts` — perché un'ellisse e non un cerchio: vedi i
  commenti nel file e `docs/PRD-misura.md` §6.
- I modelli MediaPipe (`pose_landmarker_lite`, `selfie_segmenter`) vengono
  scaricati da Google Cloud Storage al primo uso e cacheati dal browser —
  nessun peso modello è incluso nel bundle.
