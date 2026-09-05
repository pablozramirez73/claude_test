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

## Eseguire con Docker

Tutto ciò che tocca fotocamera, sensori di movimento e la pipeline
MediaPipe/WASM gira nel **browser di chi guarda la pagina**, sulla macchina
host — una Telegram Mini App è solo una pagina web. Il container serve solo
quella pagina: non serve alcun passthrough di dispositivi (`--device`,
`/dev/video0`, ecc.).

```bash
cd apps/misura-miniapp

# Build di produzione (nginx) → http://localhost:8091
docker compose up misura

# Server di sviluppo con hot reload → http://localhost:5183
docker compose up misura-dev
```

Apri l'URL in un browser sulla stessa macchina. Importante: apri **proprio
`localhost:<porta>`** — il browser considera `http://localhost` un contesto
sicuro (secure context) anche senza HTTPS, il che è ciò che permette a
`getUserMedia`/`DeviceMotionEvent` di funzionare. Aprendo l'app da un altro
dispositivo sulla LAN tramite l'IP della macchina host, senza HTTPS la
fotocamera verrebbe bloccata dal browser — per quel caso serve un reverse
proxy TLS davanti al container (fuori scope per questo POC locale).

**Porte già occupate?** Sono configurabili senza toccare `docker-compose.yml`,
copiando `.env.example` in `.env` (stessa cartella) oppure passandole inline:

```bash
cp .env.example .env   # poi modifica i valori dentro .env
# oppure, una tantum:
MISURA_WEB_PORT=9000 MISURA_DEV_PORT=9001 docker compose up misura
```

Senza Docker Compose, gli stessi target si possono buildare ed eseguire a mano
(qui le porte si scelgono direttamente nel flag `-p host:container`):

```bash
docker build --target production -t misura:prod . && docker run -p 9000:80 misura:prod
docker build --target dev -t misura:dev .        && docker run -p 9001:5173 -v "$PWD":/app -v /app/node_modules misura:dev
```

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
