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
- Backend: Node.js + Telegraf.js (solo per salvataggio profili anonimizzati) —
  `apps/misura-bot`
- Hosting: Cloudflare Pages / Vercel (per WASM veloce)
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
- **Fuori scope in questo POC** (richiedono hardware/infra non testabile qui, ma sono
  disegnati nell'architettura sopra): accesso diretto ad ARKit Depth API nativo (solo
  WebXR Depth Sensing lato web), backend di produzione multi-tenant, pagamenti
  Telegram Stars/TON, "Armadio Misure" multi-brand.
