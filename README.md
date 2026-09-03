# ErgoCheck — l'RSPP in tasca

Mini App Telegram per l'audit ergonomico e la verifica dei requisiti di
sicurezza previsti dal **D.Lgs 81/08**. Si inquadra il lavoratore per 15
secondi con lo smartphone e si ottengono punteggio NIOSH, verifica di
illuminamento e rumore e un report PDF pronto da allegare al DVR, recapitato
nel gruppo Telegram dell'azienda.

Una valutazione ergonomica tradizionale costa circa 800 €/giorno e produce un
dato spot. ErgoCheck abbassa il costo marginale del singolo rilievo quasi a
zero e rende il dato **continuo**: la dashboard mostra come il rischio si
muove nel tempo per postazione.

---

## Architettura

```
frontend_tma/          Telegram Mini App (Vite + React + TypeScript)
  src/lib/             geometria ergonomica, SDK Telegram, client REST
  src/hooks/           MediaPipe, IMU, luce, rumore, camera
  src/components/      overlay posa, gauge di rischio, checklist sensori
  src/pages/           home, acquisizione, esito, dashboard, storico, piani

backend/               API Django 5 + DRF + Channels + Celery
  apps/accounts/       TelegramUser, Company, verifica HMAC di initData
  apps/assessments/    modello, motore NIOSH, report PDF, task, WebSocket
  apps/billing/        piani, quote, Stripe Checkout e webhook
  apps/bot/            comandi del bot e consegna dei report
```

**Il video non lascia mai il dispositivo.** MediaPipe gira in WASM dentro la
Mini App; al backend arriva solo un JSON di angoli aggregati (media, 95°
percentile, massimo) più i valori dei sensori. È la scelta che tiene le
immagini del lavoratore fuori dal perimetro di trattamento.

### Flusso

1. L'utente apre `t.me/ErgoCheckBot/app` → la Mini App si autentica con
   `initData` firmata da Telegram.
2. Sceglie il tipo di valutazione: sollevamento, videoterminale o
   movimentazione.
3. La checklist dei prerequisiti verifica camera, modelli, stabilità del
   telefono, illuminamento e rumore. **Se il telefono non è stabile la
   scansione non parte**: angoli ricostruiti da un'inquadratura che oscilla
   non sono difendibili in sede di verifica.
4. 15 secondi di analisi on-device, con overlay dello scheletro e feedback
   aptico quando un angolo esce dai limiti.
5. Il backend calcola il punteggio, genera il PDF con Celery e lo invia nel
   gruppo aziendale.

---

## Il motore di calcolo

`backend/apps/assessments/niosh_calculator.py` è puro Python, senza
dipendenze da Django, e contiene tre blocchi:

**Equazione NIOSH rivista (1991)**, recepita dalla ISO 11228-1 e richiamata
dall'Allegato XXXIII:

```
RWL = 23 × HM × VM × DM × AM × FM × CM        IS = peso movimentato / RWL
```

I moltiplicatori di frequenza vengono letti dalla tabella ufficiale con
interpolazione lineare fra le righe; quello di presa (CM) usa la
classificazione della mano fatta dal Hand Landmarker.

**Punteggio posturale** in stile RULA/REBA su flessione e torsione del
tronco, elevazione del braccio, flessione del collo e angolo del ginocchio —
quest'ultimo distingue il sollevamento in *squat* da quello in *stoop*.

**Conformità ambientale**: illuminamento sotto i 200 lux (All. XXXIV) e
rumore sopra gli 80 dB(A) (art. 189) generano rilievi con riferimento
normativo e azione correttiva.

Le fasce di rischio seguono la prassi italiana sull'indice di sollevamento:
IS ≤ 0,85 accettabile · 0,85–1 borderline · 1–2 rischio · > 2 elevato.

### Attendibilità delle misure

Illuminamento e rumore sono acquisiti con i sensori dello smartphone: sono
**stime di pre-screening**, non rilievi strumentali certificati. Il report lo
dichiara esplicitamente nella nota metodologica e il documento si presenta
come elemento istruttorio a supporto della valutazione del Datore di Lavoro
ex art. 28, non come suo sostituto.

---

## Deploy

Due topologie, entrambe documentate in [`deploy/`](deploy/README.md):

- **Tutto su una macchina**, anche un computer personale: un solo container
  nginx serve la Mini App e inoltra `/api/` e `/ws/` al backend, e
  Cloudflare Tunnel lo pubblica su un unico hostname. Mini App e API sulla
  stessa origine, nessuna porta aperta sul router.
  Vedi [`deploy/computer-locale.md`](deploy/computer-locale.md).
- **Distribuita**: Mini App su Cloudflare Pages, API su un VPS dietro
  Cloudflare. Pages serve solo file statici, mentre Django, Celery,
  PostgreSQL e Redis richiedono un server.

## Avvio rapido

### Con Docker

```bash
cp backend/.env.example backend/.env      # inserisci TELEGRAM_BOT_TOKEN
docker compose up --build
```

Espone l'API su `:7000` (servizio `ergo-api`) e la Mini App su `:5190`.

### In locale

```bash
make install          # dipendenze backend + Mini App + asset MediaPipe
make migrate
make run              # API ASGI su :7000
make worker           # worker Celery in un altro terminale
make bot              # bot in polling
make tma-dev          # Mini App su :5190
```

Servono PostgreSQL e Redis in ascolto (o si usano i servizi del compose).

### Senza PostgreSQL e Redis

Per una prova rapida con le sole dipendenze Python esiste
`config.settings_dev`: SQLite, cache e channel layer in memoria, task Celery
eseguiti in linea.

```bash
cd backend
export DJANGO_SETTINGS_MODULE=config.settings_dev
python manage.py migrate
python manage.py sqlite_wal        # una volta sola: journal WAL sul file
python -m uvicorn config.asgi:application --port 7000
```

### Configurare il bot

1. Crea il bot con [@BotFather](https://t.me/BotFather) e prendi il token.
2. Pubblica la Mini App su un dominio **https** (Telegram non accetta http) e
   registrala con `/newapp`.
3. Compila `TELEGRAM_BOT_TOKEN` e `TMA_URL` in `backend/.env`.
4. In produzione, al posto del polling: `python manage.py set_webhook https://api.tuodominio.it/api/v1/bot/webhook/`.
5. Aggiungi il bot al gruppo aziendale e invia `/collega` per registrarlo
   come destinatario dei report.

---

## API

| Metodo | Endpoint | Descrizione |
| --- | --- | --- |
| `GET` | `/api/v1/me/` | profilo e azienda dell'utente corrente |
| `POST` | `/api/v1/companies/join/` | registra o aggancia un'azienda |
| `POST` | `/api/v1/assessments/` | crea la valutazione dagli angoli on-device |
| `GET` | `/api/v1/assessments/` | elenco filtrabile per tipo, livello, postazione |
| `GET` | `/api/v1/assessments/{id}/report/` | stato del PDF |
| `POST` | `/api/v1/reports/generate/` | rigenera il report (task Celery) |
| `GET` | `/api/v1/companies/{id}/dashboard/` | trend del rischio e criticità ricorrenti |
| `GET` | `/api/v1/thresholds/` | soglie normative per il feedback in tempo reale |
| `GET` | `/api/v1/billing/plans/` | listino |
| `POST` | `/api/v1/billing/checkout/` | Stripe Checkout Session |
| `WS` | `/ws/assessments/` | aggiornamenti di stato del report |

### Autenticazione

Ogni richiesta porta l'header `X-Telegram-Init-Data` con la stringa firmata
da Telegram. Il server ricalcola l'HMAC-SHA256 con
`secret = HMAC("WebAppData", bot_token)`, confronta in tempo costante e
rifiuta le initData più vecchie di 24 ore. Non ci sono sessioni né token da
conservare sul dispositivo.

Esempio di creazione:

```http
POST /api/v1/assessments/
X-Telegram-Init-Data: query_id=...&user=...&auth_date=...&hash=...

{
  "type": "LIFT",
  "worker_ref": "MAG-014",
  "workstation": "Baia di carico 2",
  "pose_data": {
    "trunk_flexion_deg": {"mean": 41.2, "p95": 55.8, "max": 63.1},
    "trunk_twist_deg":   {"mean": 14.0, "p95": 27.5},
    "knee_angle_deg":    {"mean": 168.0, "p95": 174.0},
    "hand_grip": "POOR", "samples": 418, "fps": 28
  },
  "task_data": {
    "load_kg": 18, "h_cm": 48, "v_cm": 28, "d_cm": 85,
    "freq_per_min": 4, "duration": "LONG"
  },
  "light_lux": 145, "noise_db": 86, "device_tilt_deg": 1.4,
  "duration_s": 15.1, "frames_analyzed": 418
}
```

Risposta: punteggio, livello, indice di sollevamento, peso limite
raccomandato ed elenco dei rilievi; il PDF arriva subito dopo sul canale
WebSocket e nel gruppo Telegram.

---

## Privacy

- Nessun frame video viene trasmesso o salvato: l'inferenza è on-device.
- Il campo `worker_ref` è pensato per un codice pseudonimo (`MAG-014`), non
  per il nome del lavoratore; l'interfaccia lo ricorda al momento
  dell'inserimento.
- `pose_data` accetta solo chiavi note: quelle sconosciute vengono scartate
  in fase di validazione.
- Ogni utente vede esclusivamente i dati della propria azienda; la dashboard
  di un'altra azienda risponde 403.
- `purge_stale_reports` cancella dallo storage i PDF oltre il periodo di
  conservazione, mantenendo il dato statistico.

---

## Piani

| Piano | Prezzo | Quota |
| --- | --- | --- |
| Freemium | gratis | 3 valutazioni complessive, PDF con watermark |
| Pro | 49 €/mese | 50 valutazioni/mese, dashboard, invio automatico |
| Agency White-Label | 299 €/mese | valutazioni illimitate, logo e dominio del consulente |

Superata la quota l'API risponde **402** e la Mini App apre il paywall.

---

## Test e qualità

```bash
cd backend && pytest          # 47 test
cd backend && ruff check .
cd frontend_tma && npm run lint && npm run build
```

La suite copre i moltiplicatori NIOSH confrontati con la tabella ufficiale,
la verifica di initData (firma manomessa, token errato, payload scaduto),
l'isolamento fra aziende, le quote dei piani e la generazione del PDF.

---

## Limiti noti

- Gli angoli derivano da una singola camera: la profondità è stimata dal
  modello e la torsione del busto ha un errore maggiore rispetto a un sistema
  optoelettronico. La checklist di stabilità serve proprio a contenerlo.
- La stima dei lux dalla luminanza del frame è calibrata su una curva
  empirica; dove disponibile viene usato l'`AmbientLightSensor`.
- Il livello sonoro dipende dal microfono del dispositivo: l'offset di
  calibrazione (`CALIBRATION_OFFSET_DB`) va tarato per parco dispositivi.
- L'`AmbientLightSensor` non è disponibile su iOS: lì vale sempre la stima.
