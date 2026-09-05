# MISURA — Il Sarto LiDAR per Shop Telegram

**Tagline:** Dalla chat alla taglia perfetta in 10 secondi.
**Verticale:** Fashion-Tech / E-commerce / Telegram Mini App
**Stato:** Prima stesura — MVP Concept (questo documento) + POC implementativo in `apps/misura-miniapp`

## 1. Elevator Pitch

MISURA è una Telegram Mini App che trasforma qualsiasi iPhone Pro / iPad Pro in un sarto
digitale. L'utente si scansiona una volta sola e ottiene le sue misure reali in cm,
provabili su qualsiasi capo venduto tramite bot Telegram. Obiettivo: azzerare i resi.

## 2. Problema & Opportunità

- Il 68% dei resi nell'abbigliamento online è per taglia sbagliata.
- I bot shop su Telegram non hanno camerini virtuali.
- Le soluzioni con sola RGB sono imprecise perché non hanno una scala metrica reale.

## 3. Soluzione

Combinare la segmentazione corporea di MediaPipe con una mappa di profondità metrica
(LiDAR/WebXR Depth Sensing quando disponibile, calibrazione a oggetto noto altrimenti)
per estrarre misure antropometriche reali.

## 4. User Journey

1. Utente clicca "Trova la mia taglia" nello shop Telegram.
2. Mini App si apre, chiede consenso GDPR e di appoggiare il telefono verticalmente a
   2–2.5m di distanza.
3. Guida vocale/testuale: "Gira su te stesso lentamente".
4. Scansione: l'accelerometro conferma stabilità, il sensore di profondità (LiDAR o
   fallback) acquisisce la scala metrica.
5. MediaPipe segmenta la silhouette e trova i landmark corporei.
6. Calcolo misure: petto, vita, fianchi, lunghezza braccia/gambe.
7. Risultato: "Sei una M perfetta per questo brand, S per questo altro". Salva profilo
   nel bot (Telegram CloudStorage).
8. Share: l'utente genera un link `t.me/shop_bot?start=fit_123` da inviare ad amici.

## 5. Architettura Tecnica

**Frontend Mini App (Web):**
- Telegram WebApp SDK
- Vite + React + TypeScript
- Rendering 3D: Three.js + `@react-three/fiber` per l'avatar

**Core Vision:**
- `@mediapipe/tasks-vision`: `PoseLandmarker` (lite) + `ImageSegmenter` (selfie
  segmentation), esecuzione in WASM, 100% on-device
- Modulo di stima circonferenza da 2D + profondità (approssimazione ellittica, non solo
  cerchio — vedi §6)

**Sensor Layer:**
- LiDAR (ARKit Depth API / WebXR Depth Sensing): fornisce un `depthBuffer` in metri,
  fondamentale per convertire pixel → cm. Accesso via `XRDepthInformation`.
- Accelerometro + Giroscopio (`DeviceMotionEvent`): valida che il telefono non si muova
  durante lo scan.
- Fallback "Carta di Credito" quando LiDAR/WebXR Depth non è disponibile (vedi §9).

## 6. Ruolo MediaPipe nel dettaglio

- `pose_landmarker.task`: estrae 33 keypoint. Interessano soprattutto shoulder, hip, knee.
- `selfie_segmenter.task`: crea una maschera binaria persona/sfondo per isolare la
  silhouette dal rumore di sfondo.
- Calcolo: la circonferenza corporea **non** è un cerchio — usiamo un'approssimazione
  ellittica (formula di Ramanujan) con semiasse frontale (larghezza spalle/vita/fianchi
  dai landmark) e semiasse di profondità (spessore corpo, dal depth buffer quando
  disponibile, altrimenti da un rapporto antropometrico tipico). Questo è il motivo per
  cui il LiDAR conta: senza spessore reale, la sola larghezza 2D sottostima
  sistematicamente la circonferenza.

## 7. Integrazione Telegram

- `WebApp.initData` per associare le misure a `user_id`.
- `WebApp.CloudStorage` per salvare il profilo fit lato client (sincronizzato da Telegram).
- Bot API: il bot può notificare al venditore le misure salvate (fuori scope MVP).
- Inline mode / deep link `t.me/shop_bot?start=fit_<id>` per condividere l'avatar/misure.

## 8. Stack Tecnico MVP

- Frontend: TypeScript, `@mediapipe/tasks-vision`, Three.js, `@react-three/fiber`
- Backend: Django + Django REST Framework + PostgreSQL (storage profili
  anonimizzati) — `apps/misura-backend`. Scelta pragmatica per l'uso locale
  via Docker; l'idea originale Node.js + Telegraf.js resta valida per un
  eventuale processo bot separato (webhook/polling), non ancora implementato.
- Hosting: Cloudflare Pages / Vercel (per WASM veloce) per il frontend;
  il backend Django è pensato per girare in container Docker propri (vedi
  `apps/misura-backend/docker-compose.yml`).
- Permessi richiesti: camera, accelerometer, gyroscope, xr-spatial-tracking

## 9. Fallback per device senza LiDAR

Modalità "Carta di Credito": l'utente appoggia una carta di credito/bancomat come
riferimento metrico noto (85.60 × 53.98 mm, standard ISO/IEC 7810 ID-1). Il modulo
`measure/calibration.ts` stima il fattore mm/pixel da lì. Precisione stimata ~2.5cm,
resta comunque usabile per uno shop online.

## 10. Privacy & Compliance

- Nessun video lascia il telefono: MediaPipe gira in WASM, on-device.
- Il frame/nuvola di punti usati per il calcolo vengono scartati subito dopo la stima
  (si conservano solo le misure numeriche finali, non le immagini).
- GDPR: consenso esplicito richiesto prima di attivare camera/sensori (schermata
  `WelcomeScreen`), con possibilità di rifiuto e di cancellazione del profilo salvato.

## 11. Cosa implementa questo POC (`apps/misura-miniapp`)

Per restare in scope MVP e verificabile in questo ambiente, il POC copre l'intero
percorso utente end-to-end con dati reali dove il browser lo permette, e con fallback
espliciti e commentati dove serve hardware non simulabile qui:

- Flusso schermate completo: Consenso → Scan guidato → Elaborazione → Risultati → Profilo.
- Cattura reale da webcam (`getUserMedia`) + controllo stabilità reale da
  `DeviceMotionEvent`.
- Pipeline MediaPipe reale (`PoseLandmarker` + `ImageSegmenter`) via CDN WASM.
- Layer di profondità con feature-detection reale di WebXR Depth Sensing
  (`sensors/depth.ts`): usato automaticamente se il device/browser lo supporta: altrimenti
  si passa alla calibrazione "Carta di Credito" (§9), implementata e funzionante in
  qualunque browser con webcam.
- Calcolo antropometrico reale (ellisse di Ramanujan) testato con Vitest
  (`measure/*.test.ts`).
- Integrazione Telegram WebApp SDK reale (theme, `MainButton`, `HapticFeedback`,
  `CloudStorage`, deep link) quando la mini app gira dentro Telegram; degrada a tab
  browser normale in sviluppo locale.
- Backend reale (`apps/misura-backend`): API Django/DRF + PostgreSQL, containerizzata
  (`docker-compose.yml` con migration automatiche all'avvio), che salva/legge/cancella
  profili con l'id Telegram sempre hashato lato server prima di essere scritto su DB
  (mai in chiaro — vedi `profiles/hashing.py`) e con misure validate in un range
  plausibile. Coperta da test (`profiles/tests.py`). **Non ancora collegata al
  frontend**: oggi il salvataggio profilo passa solo da Telegram CloudStorage
  lato client; questa API è pronta per essere richiamata quando si vorrà anche
  uno storage server-side.
- LLM locale per consigli di stile (`profiles/llm.py`, `POST
  /api/profiles/<id>/advice/`): non nello spec originale, aggiunto su
  richiesta esplicita. Chiama un'istanza **Ollama** (default `gemma4:latest`)
  già in esecuzione sulla macchina dell'utente — non containerizzata da
  questo progetto, il backend la raggiunge da dentro Docker via
  `host.docker.internal`. Stessa filosofia privacy del resto del progetto:
  nessun dato inviato a servizi esterni. Best-effort: il resto dell'API
  non dipende in alcun modo dalla sua disponibilità.
- Admin operativo (`/admin/`, `profiles/admin.py` + `profiles/dashboard.py`):
  non nello spec originale, aggiunto su richiesta esplicita. Tema
  **django-unfold**, pagina iniziale sostituita da una dashboard reale
  (KPI, distribuzione taglie, misure medie, ultimi profili, stato live
  dell'LLM locale) invece del semplice elenco modelli di default.
- **Fuori scope in questo POC** (richiedono hardware/infra non testabile qui, ma sono
  disegnati nell'architettura sopra): accesso diretto ad ARKit Depth API nativo (solo
  WebXR Depth Sensing lato web), il vero e proprio processo bot Telegram
  (webhook/polling sul token), pagamenti Telegram Stars/TON, "Armadio Misure"
  multi-brand.
