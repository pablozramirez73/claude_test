# Pubblicare l'API dal proprio computer

Percorso pensato per chi non ha un server: il computer di casa fa da
origine, Cloudflare Tunnel lo espone su `api.syntaxnode.work` senza aprire
porte sul router. Tutto gira in Docker, così non si installano PostgreSQL e
Redis a livello di sistema.

## Cosa comporta davvero

Prima di partire, tre conseguenze da mettere in conto:

- **Il computer deve restare acceso e sveglio.** Se si sospende o va
  offline, la Mini App si apre ma ogni chiamata fallisce. Va disattivata la
  sospensione automatica, almeno quando il servizio deve essere raggiungibile.
- **È un ambiente di prova, non di produzione.** Va bene per dimostrazioni,
  per il primo cliente, per validare l'idea. Per un servizio venduto a
  un'azienda serve un server con continuità, backup e aggiornamenti.
- **I dati stanno sul disco di casa.** Le valutazioni ergonomiche riguardano
  postazioni di lavoro reali: prevedi un backup del volume PostgreSQL prima
  di raccogliere dati di clienti veri.

Il tunnel non espone il resto del computer: raggiungibile è solo il
servizio mappato nella dashboard, e la connessione parte dall'interno.

## 1. Prerequisiti

Installa **Docker Desktop** (macOS/Windows) o **Docker Engine + compose**
(Linux). Verifica:

```bash
docker --version
docker compose version
```

Su Windows, lavora dentro **WSL2** e tieni il repository nel filesystem
Linux (`~/…`, non `/mnt/c/…`): sui percorsi montati il build è molto lento.

## 2. Configurazione dell'API

```bash
git clone <repo> ergocheck && cd ergocheck
cp deploy/env.production.example backend/.env
```

Apri `backend/.env` e compila almeno:

```
DJANGO_SECRET_KEY=<python3 -c "import secrets;print(secrets.token_urlsafe(64))">
DEBUG=False
ALLOWED_HOSTS=api.syntaxnode.work
CORS_ALLOWED_ORIGINS=https://syntaxnode.work
CSRF_TRUSTED_ORIGINS=https://syntaxnode.work,https://api.syntaxnode.work
TMA_URL=https://syntaxnode.work
TELEGRAM_BOT_TOKEN=<token di @BotFather>
```

`DATABASE_URL` e `REDIS_URL` non toccarli: li imposta il compose verso i
container `db` e `redis`.

## 3. Il tunnel

Dalla dashboard, **Zero Trust → Networks → Tunnels → Create a tunnel →
Cloudflared**:

1. Nome `ergocheck-api`, poi **Save**.
2. Nella schermata di installazione, copia il **token** (la stringa lunga
   dentro il comando mostrato). Non serve installare cloudflared a mano:
   lo esegue un container.
3. **Public Hostname → Add a public hostname**:

   | Campo | Valore |
   | --- | --- |
   | Subdomain | `api` |
   | Domain | `syntaxnode.work` |
   | Type | `HTTP` |
   | URL | `api:8000` |

   `api:8000` è il nome del servizio nella rete di compose: il container
   cloudflared lo risolve da solo, senza passare dall'host.

Metti il token in un file `.env` nella radice del repository — quello letto
da compose, diverso da `backend/.env`:

```bash
echo "CLOUDFLARE_TUNNEL_TOKEN=<token>" > .env
```

È già in `.gitignore`: non finisce nel repository.

## 4. Avvio

```bash
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml \
  up -d --build db redis api worker beat bot cloudflared
```

Il servizio `tma` non va avviato: la Mini App sta su Cloudflare Pages.

Crea l'utente amministratore:

```bash
docker compose exec api python manage.py createsuperuser
```

## 5. Verifica

```bash
# 1. l'API risponde in locale
curl http://127.0.0.1:8000/healthz/

# 2. e attraverso il tunnel
curl https://api.syntaxnode.work/healthz/
# -> {"status": "ok", "service": "ergocheck"}

# 3. il preflight dichiara l'header di initData (senza questo la Mini App
#    non riesce a chiamare l'API da https://syntaxnode.work)
curl -sI -X OPTIONS https://api.syntaxnode.work/api/v1/me/ \
  -H "Origin: https://syntaxnode.work" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: x-telegram-init-data" \
  | grep -i access-control-allow-headers

# 4. il tunnel è sano
docker compose logs cloudflared | tail -20
```

Nella dashboard il tunnel deve risultare **HEALTHY**.

## 6. Impedire la sospensione

| Sistema | Comando |
| --- | --- |
| macOS | `caffeinate -dimsu` (lascia il terminale aperto) |
| Linux | `systemd-inhibit --what=sleep --why="ErgoCheck" sleep infinity` |
| Windows | Impostazioni → Alimentazione → Sospensione: **Mai** |

Su macOS con il coperchio chiuso serve l'alimentatore collegato, altrimenti
il sistema sospende comunque.

## Gestione quotidiana

```bash
docker compose logs -f api                 # log dell'API
docker compose restart api                 # riavvio dopo modifiche a .env
docker compose down                        # ferma tutto (i dati restano)
docker compose exec db pg_dump -U ergocheck ergocheck > backup.sql
```

Dopo un `git pull`:

```bash
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml \
  up -d --build api worker beat bot
```
