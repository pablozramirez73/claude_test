# MISURA — backend

API di storage per i profili MISURA (misure + associazione anonimizzata
all'utente Telegram), in **Django + Django REST Framework + PostgreSQL**.

> Nota rispetto al PRD: `docs/PRD-misura.md` §8 descrive uno stack MVP con
> Node.js + Telegraf.js. Questo backend usa Django/Postgres su richiesta
> esplicita — copre lo storage dei profili (quello che conta per l'uso
> locale/Docker); l'eventuale bot Telegram (webhook/polling con
> `python-telegram-bot` o simili, lettura del token da env) resta da
> aggiungere quando serve, non è ancora implementato qui.

## Cosa fa

- `POST /api/profiles/` — salva un profilo (`chest_cm`, `waist_cm`,
  `hips_cm`, opzionale `telegram_user_id` che viene **hashato subito e mai
  memorizzato in chiaro** — vedi `profiles/hashing.py` e
  `docs/PRD-misura.md` §10).
- `GET /api/profiles/<profile_id>/` — legge un profilo.
- `DELETE /api/profiles/<profile_id>/` — lo cancella (il diritto
  all'oblio GDPR menzionato nel PRD).
- `GET /api/health/` — health check.
- `POST /api/profiles/<profile_id>/advice/` — genera (o restituisce, se già
  in cache) un consiglio di stile/vestibilità in linguaggio naturale per il
  profilo, usando un **LLM locale via Ollama** (`profiles/llm.py`) — vedi
  sotto. Aggiungi `?regenerate=true` per forzare una nuova generazione
  invece di riusare quella salvata.

Nessuna immagine, nessun video, nessuna point cloud: quei dati non lasciano
mai il client (vedi `apps/misura-miniapp`) — qui arrivano solo le tre
misure numeriche finali.

## Consigli di stile via LLM locale (Ollama)

Funzionalità aggiunta su richiesta esplicita, non nello spec originale del
PRD. `POST /api/profiles/<id>/advice/` chiama un modello Ollama (default
`gemma4:latest`, configurabile con `OLLAMA_MODEL`) — nessuna misura o dato
esce mai verso un servizio esterno.

**Importante**: questo progetto non installa, avvia o scarica Ollama.
Usa un'istanza Ollama che **hai già in esecuzione tu** sulla macchina
(es. `ollama serve`, in ascolto su `127.0.0.1:11434`). Il container del
backend la raggiunge tramite `host.docker.internal` (mappato in
`docker-compose.yml` via `extra_hosts`) — da dentro un container,
`127.0.0.1` indicherebbe il container stesso, non l'host, per questo non
si può usare direttamente quell'indirizzo.

- Se Ollama non è in esecuzione sul tuo host, `POST .../advice/` risponde
  `503` con un messaggio chiaro — nessun'altra funzionalità dell'API ne
  risente.
- Assicurati di avere già scaricato il modello sul tuo Ollama locale
  (`ollama pull gemma4:latest` o il tag che preferisci — vedi `OLLAMA_MODEL`
  in `.env.example`).
- Se il tuo Ollama ascolta altrove (porta diversa, altra macchina in LAN),
  sovrascrivi `OLLAMA_BASE_URL` in `.env`.

## Eseguire con Docker

```bash
cd apps/misura-backend
cp .env.example .env   # opzionale, solo se vuoi cambiare porte/credenziali

docker compose up backend        # gunicorn → http://localhost:8099
# oppure, con hot reload:
docker compose up backend-dev    # → http://localhost:8098
```

Le migration girano automaticamente all'avvio del container
(`entrypoint.sh` attende Postgres, poi esegue `manage.py migrate`).

Porte già occupate? Sono tutte sovrascrivibili — vedi `.env.example`
(`BACKEND_PORT`, `BACKEND_DEV_PORT`, `POSTGRES_PORT`).

## Sviluppo locale senza Docker

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# richiede un Postgres raggiungibile — o esporta le POSTGRES_* per puntare
# a quello lanciato da `docker compose up db` in questa stessa cartella
python manage.py migrate
python manage.py runserver 0.0.0.0:8000
```

### Test

```bash
python manage.py test profiles
```

(Il test runner di Django crea un database di test usando lo stesso motore
configurato in `DATABASES` — quindi serve un Postgres raggiungibile anche
per i test, salvo puntare temporaneamente a sqlite via una propria
`DJANGO_SETTINGS_MODULE` di override, mai committata.)

## Collegamento con il frontend

Il frontend (`apps/misura-miniapp`) oggi salva i profili solo lato client
(Telegram CloudStorage / localStorage — vedi `src/telegram/webapp.ts`) e
**non chiama ancora questa API**. Le origini CORS di default
(`DJANGO_CORS_ALLOWED_ORIGINS`) sono già pre-configurate sulle porte del
frontend, pronte per quando si vorrà collegarli.
