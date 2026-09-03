# Far girare tutto in locale con Docker

Percorso pensato per chi non ha un server: il computer di casa esegue
l'intera applicazione — Mini App, API, PostgreSQL, Redis, worker e bot — e
Cloudflare Tunnel la pubblica su `syntaxnode.work` senza aprire porte sul
router. Niente Cloudflare Pages, niente PostgreSQL o Redis installati a
livello di sistema: tutto in container.

## Come è messa insieme

```
   Telegram ──► syntaxnode.work ──► tunnel ──► container `tma` (nginx)
                                                 │
                                                 ├── /            Mini App compilata
                                                 └── /api/ /ws/   ──► ergo-api:7000
                                                     /admin/ /media/     (daphne)
                                                                          │
                                                              db · redis · worker · beat · bot
```

Un solo hostname pubblico. Mini App e API stanno quindi **sulla stessa
origine**: niente preflight CORS da soddisfare, niente WebSocket che
attraversa origini, un solo record DNS. È la ragione per cui nginx sta
davanti anche all'API invece di esporla separatamente.

## Cosa comporta davvero

- **Il computer deve restare acceso e sveglio.** Se si sospende o va
  offline, la Mini App non si apre più.
- **È un ambiente di prova, non di produzione.** Va bene per dimostrazioni,
  per il primo cliente, per validare l'idea. Per un servizio venduto a
  un'azienda serve continuità, backup e aggiornamenti.
- **I dati stanno sul disco di casa.** Le valutazioni riguardano postazioni
  di lavoro reali: prevedi un backup del volume PostgreSQL prima di
  raccogliere dati di clienti veri.

Il tunnel non espone il resto del computer: raggiungibile è solo il
servizio mappato nella dashboard, e la connessione parte dall'interno.

## 1. Prerequisiti

Installa **Docker Desktop** (macOS/Windows) o **Docker Engine + compose**
(Linux):

```bash
docker --version
docker compose version
```

Su Windows lavora dentro **WSL2**, con il repository nel filesystem Linux
(`~/…`, non `/mnt/c/…`): sui percorsi montati il build è molto più lento.

## 2. Configurazione

```bash
git clone <repo> ergocheck && cd ergocheck
cp deploy/env.production.example backend/.env
```

In `backend/.env` compila almeno:

```
DJANGO_SECRET_KEY=<python3 -c "import secrets;print(secrets.token_urlsafe(64))">
DEBUG=False
ALLOWED_HOSTS=syntaxnode.work
CSRF_TRUSTED_ORIGINS=https://syntaxnode.work
TMA_URL=https://syntaxnode.work
TELEGRAM_BOT_TOKEN=<token di @BotFather>
```

`CORS_ALLOWED_ORIGINS` resta vuoto: con un solo hostname non serve.
`DATABASE_URL` e `REDIS_URL` non toccarli, li imposta il compose.

## 3. Il tunnel

Dalla dashboard, **Zero Trust → Networks → Tunnels → Create a tunnel →
Cloudflared**:

1. Nome `ergocheck`, poi **Save**.
2. Nella schermata di installazione copia il **token** (la stringa lunga
   dentro il comando mostrato). Non installare cloudflared a mano: lo
   esegue un container.
3. **Public Hostname → Add a public hostname**, uno solo:

   | Campo | Valore |
   | --- | --- |
   | Subdomain | *(vuoto)* |
   | Domain | `syntaxnode.work` |
   | Type | `HTTP` |
   | URL | `tma:80` |

   `tma` è il nome del servizio nella rete di compose: il connettore lo
   raggiunge direttamente, senza passare dalle porte pubblicate sull'host.

Metti il token in un file `.env` nella radice del repository — quello letto
da compose, diverso da `backend/.env`:

```bash
echo "CLOUDFLARE_TUNNEL_TOKEN=<token>" > .env
```

È già in `.gitignore`.

## 4. Avvio

```bash
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml up -d --build
```

Il primo build scarica i modelli MediaPipe (circa 17 MB) dentro l'immagine
della Mini App: richiede qualche minuto. Poi:

```bash
docker compose exec ergo-api python manage.py createsuperuser
```

## 5. Verifica

```bash
# 1. la Mini App risponde in locale
curl -I http://127.0.0.1:5190/

# 2. l'API attraverso nginx, sulla stessa origine
curl http://127.0.0.1:5190/healthz/
# -> {"status": "ok", "service": "ergocheck"}

# 3. dall'esterno, attraverso il tunnel
curl https://syntaxnode.work/healthz/
curl -I https://syntaxnode.work/

# 4. il tunnel è sano
docker compose logs cloudflared | tail -20
```

Nella dashboard il tunnel deve risultare **HEALTHY**.

Apri poi `https://syntaxnode.work` in un browser: deve comparire la
schermata di registrazione dell'azienda. Fuori da Telegram non c'è
`initData`, quindi le chiamate all'API rispondono 401: è il comportamento
atteso. La prova vera si fa aprendo la Mini App dal bot.

## 6. Il bot

Su [@BotFather](https://t.me/BotFather): `/newapp` sul bot, URL della Mini
App `https://syntaxnode.work`. Poi aggiungi il bot al gruppo aziendale e
invia `/collega` per registrarlo come destinatario dei report.

## 7. Impedire la sospensione

| Sistema | Comando |
| --- | --- |
| macOS | `caffeinate -dimsu` (lascia il terminale aperto) |
| Linux | `systemd-inhibit --what=sleep --why="ErgoCheck" sleep infinity` |
| Windows | Impostazioni → Alimentazione → Sospensione: **Mai** |

Su macOS con il coperchio chiuso serve l'alimentatore collegato.

## Gestione quotidiana

```bash
docker compose logs -f ergo-api            # log dell'API
docker compose logs -f tma                 # log di nginx
docker compose restart ergo-api            # dopo modifiche a backend/.env
docker compose down                        # ferma tutto (i dati restano)
docker compose exec db pg_dump -U ergocheck ergocheck > backup.sql
```

Dopo un `git pull`:

```bash
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml up -d --build
```

Le modifiche alla Mini App richiedono la ricostruzione dell'immagine `tma`:
il codice viene compilato dentro il container, non montato.
