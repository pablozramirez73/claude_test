# Deploy di ErgoCheck su syntaxnode.work

## Topologia

```
                    ┌──────────────────────────────────────┐
   Telegram  ─────►  │  syntaxnode.work                     │
   (Mini App)        │  Cloudflare Pages — build statica    │
                     │  frontend_tma/dist                   │
                     └───────────────┬──────────────────────┘
                                     │  fetch + WebSocket
                                     ▼
                     ┌──────────────────────────────────────┐
                     │  api.syntaxnode.work                 │
                     │  Cloudflare (proxied) → VPS          │
                     │  nginx → daphne (ASGI)               │
                     │  Celery worker + beat + bot          │
                     │  PostgreSQL + Redis                  │
                     └──────────────────────────────────────┘
```

Cloudflare Pages serve **solo** file statici: la Mini App ci sta per intero
(l'inferenza MediaPipe gira nel browser), mentre Django, Celery, PostgreSQL e
Redis richiedono il VPS.

## 1. DNS su Cloudflare

| Tipo | Nome | Contenuto | Proxy |
| --- | --- | --- | --- |
| CNAME | `syntaxnode.work` | `<progetto>.pages.dev` | Proxied |
| A | `api` | `<IP del VPS>` | Proxied |

Il record radice lo crea Cloudflare stesso quando si aggiunge il dominio
personalizzato al progetto Pages. Modalità SSL/TLS: **Full (strict)**.

## 2. Frontend su Cloudflare Pages

Build settings del progetto:

| Voce | Valore |
| --- | --- |
| Framework preset | None |
| Build command | `npm run build:prod` |
| Build output directory | `dist` |
| Root directory | `frontend_tma` |
| Node version | 20 o superiore |

`npm run build:prod` scarica i modelli MediaPipe e copia il runtime WASM in
`dist/mediapipe/`: l'app non dipende da CDN esterne a runtime. Le variabili
d'ambiente della build stanno in `frontend_tma/.env.production`.

`public/_headers` imposta `Cross-Origin-Embedder-Policy: credentialless` —
non `require-corp`, che bloccherebbe `telegram-web-app.js` (non manda l'header
CORP) impedendo l'avvio della Mini App.

Deploy manuale, in alternativa al collegamento del repository:

```bash
cd frontend_tma
export CLOUDFLARE_API_TOKEN=...      # permesso "Cloudflare Pages: Edit"
export CLOUDFLARE_ACCOUNT_ID=...
npm run deploy
```

## 3. API sul VPS

```bash
# utente e struttura
sudo adduser --system --group --home /srv/ergocheck ergocheck
sudo mkdir -p /srv/ergocheck/{media,staticfiles}
sudo chown -R ergocheck:ergocheck /srv/ergocheck

# codice e dipendenze
sudo -u ergocheck git clone <repo> /srv/ergocheck/src
sudo -u ergocheck ln -s /srv/ergocheck/src/backend /srv/ergocheck/backend
sudo -u ergocheck python3 -m venv /srv/ergocheck/venv
sudo -u ergocheck /srv/ergocheck/venv/bin/pip install -r /srv/ergocheck/backend/requirements.txt

# configurazione
sudo -u ergocheck cp deploy/env.production.example /srv/ergocheck/backend/.env
sudo -u ergocheck editor /srv/ergocheck/backend/.env

# database e statici
sudo -u ergocheck /srv/ergocheck/venv/bin/python manage.py migrate
sudo -u ergocheck /srv/ergocheck/venv/bin/python manage.py collectstatic --noinput
sudo -u ergocheck /srv/ergocheck/venv/bin/python manage.py createsuperuser

# servizi
sudo cp deploy/ergocheck-*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ergocheck-api ergocheck-worker ergocheck-beat ergocheck-bot

# TLS di origine: Cloudflare → SSL/TLS → Origin Server → Create Certificate
sudo mkdir -p /etc/ssl/cloudflare   # syntaxnode.work.pem + .key, chmod 600
sudo cp deploy/nginx-api.conf /etc/nginx/sites-available/ergocheck-api
sudo ln -s /etc/nginx/sites-available/ergocheck-api /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Verifica:

```bash
curl https://api.syntaxnode.work/healthz/
# -> {"status": "ok", "service": "ergocheck"}
```

## 4. Bot Telegram

Su [@BotFather](https://t.me/BotFather):

1. `/newapp` sul bot, URL della Mini App: `https://syntaxnode.work`
2. Il link diventa `https://t.me/<bot>/app`

In produzione conviene il webhook al posto del polling: disattiva
`ergocheck-bot.service` e registra

```bash
manage.py set_webhook https://api.syntaxnode.work/api/v1/bot/webhook/
```

Infine aggiungi il bot al gruppo aziendale e invia `/collega` per registrarlo
come destinatario dei report.

## 5. Da controllare dopo il primo deploy

- [ ] `https://syntaxnode.work` apre la Mini App dentro Telegram
- [ ] `curl https://api.syntaxnode.work/healthz/` risponde 200
- [ ] Il preflight passa: l'header `x-telegram-init-data` compare in
      `access-control-allow-headers`
- [ ] Camera, microfono e sensori chiedono il permesso (richiedono https)
- [ ] Una valutazione di prova produce il PDF e lo recapita nel gruppo
- [ ] Il firewall del VPS accetta la 443 solo dai range di Cloudflare
