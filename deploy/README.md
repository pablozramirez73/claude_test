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
| CNAME | `api` | `<UUID>.cfargotunnel.com` | Proxied |

Nessuno dei due record va creato a mano: il primo lo aggiunge Cloudflare
quando colleghi il dominio personalizzato al progetto Pages, il secondo lo
crea `cloudflared tunnel route dns`. Con il percorso alternativo senza
tunnel, `api` diventa un record **A** verso l'IP del VPS.

Modalità SSL/TLS: **Full (strict)**.

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

### Deploy manuale con wrangler

`wrangler` e' una devDependency del progetto, quindi non serve installarlo a
mano. Il token va passato tramite ambiente e non salvato in un file del
repository.

```bash
cd frontend_tma
npm install
export CLOUDFLARE_API_TOKEN=...          # permesso "Cloudflare Pages: Edit"
export CLOUDFLARE_ACCOUNT_ID=...         # opzionale con un token a un solo account

npx wrangler whoami                      # verifica token e account
npx wrangler pages project create ergocheck --production-branch main   # solo la prima volta
npm run deploy                           # build:prod + pages deploy dist
```

Il primo deploy pubblica su `https://ergocheck.pages.dev`. Il dominio
personalizzato **non** si aggiunge da wrangler (nessun comando `pages domain`
nella v4): va fatto dalla dashboard, in *Workers & Pages → ergocheck →
Custom domains → Set up a custom domain*, indicando `syntaxnode.work`.
Cloudflare crea da se' il record DNS necessario.

In alternativa, via API:

```bash
curl -X POST \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/ergocheck/domains" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"name":"syntaxnode.work"}'
```

Al termine, revoca il token se era temporaneo: *My Profile → API Tokens*.

## 3. API sul VPS

Due modi di pubblicare l'API, alternativi fra loro:

- **Cloudflare Tunnel** (consigliato): nessuna porta aperta, nessun
  certificato di origine da gestire, funziona dietro NAT. Procedura in
  [`tunnel.md`](tunnel.md).
- **Record A + Origin Certificate**: `nginx-api.conf` con i range di
  Cloudflare, descritto qui sotto.

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

# Solo per il percorso con record A. Con il Tunnel salta questo blocco:
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

## 4. Cosa si puo' e non si puo' delegare a Cloudflare

| Componente | Su Cloudflare? | Nota |
| --- | --- | --- |
| Mini App (statica) | **Sì**, Pages | l'inferenza MediaPipe gira nel browser |
| Report PDF | **Sì**, R2 | compatibile S3, nessun costo di egress |
| CDN, TLS, WAF, DDoS | **Sì** | record proxied davanti all'API |
| Accesso all'origine | **Sì**, Tunnel | runbook in [`tunnel.md`](tunnel.md) |
| PostgreSQL | No | Cloudflare non offre Postgres gestito |
| Redis | No | Workers KV non è Redis: nessun protocollo, consistenza eventuale |
| Django, Celery | No | Workers esegue JavaScript, non processi Python long-running |

D1 è SQLite (tetto di 10 GB, accessibile solo dai Workers) e Hyperdrive non
è un database: fa pooling e caching verso un Postgres che ospiti altrove, e
solo dai Workers. Nessuno dei due può stare dietro l'ORM di Django su un VPS.
Postgres e Redis restano quindi sul VPS, o su un servizio gestito
(Neon, Supabase, Upstash) raggiunto dal VPS.

### Report su R2

```bash
# Dashboard: R2 → Create bucket → ergocheck-reports (regione automatica)
# Poi R2 → Manage API tokens → Create token (Object Read & Write sul bucket)
```

Nel `.env` di produzione basta:

```
R2_ACCOUNT_ID=<account id di Cloudflare>
AWS_ACCESS_KEY_ID=<access key id del token R2>
AWS_SECRET_ACCESS_KEY=<secret access key del token R2>
AWS_STORAGE_BUCKET_NAME=ergocheck-reports
```

Endpoint, regione `auto` e firma `s3v4` vengono derivati da
`R2_ACCOUNT_ID`. Senza `R2_PUBLIC_DOMAIN` il bucket resta privato e i PDF
si servono con link firmati validi un'ora — che è la scelta giusta per
documenti che contengono valutazioni di postazioni di lavoro.

## 5. Bot Telegram

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

## 6. Da controllare dopo il primo deploy

- [ ] `https://syntaxnode.work` apre la Mini App dentro Telegram
- [ ] `curl https://api.syntaxnode.work/healthz/` risponde 200
- [ ] Il preflight passa: l'header `x-telegram-init-data` compare in
      `access-control-allow-headers`
- [ ] Camera, microfono e sensori chiedono il permesso (richiedono https)
- [ ] Una valutazione di prova produce il PDF e lo recapita nel gruppo
- [ ] Il firewall del VPS accetta la 443 solo dai range di Cloudflare
      (oppure la 443 è chiusa del tutto e si usa Cloudflare Tunnel)
- [ ] Se si usa R2: il PDF di prova compare nel bucket e il link firmato apre
