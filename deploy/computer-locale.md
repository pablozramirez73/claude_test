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

Il progetto usa **due file `.env`**, con ruoli diversi:

| File | Chi lo legge | Cosa contiene |
| --- | --- | --- |
| `backend/.env` | Django, dentro i container | chiave segreta, token del bot, domini, Stripe, R2 |
| `.env` (radice) | Docker Compose | solo il token del tunnel |

Sono separati perche' compose interpreta il simbolo `$` nei valori del file
di radice: una password che lo contiene verrebbe alterata. Il file passato
ai container (`backend/.env`) non subisce invece alcuna interpretazione.

```bash
git clone <repo> ergocheck && cd ergocheck
cp deploy/env.production.example backend/.env
cp .env.example .env
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

Tre parole che la dashboard usa in modo diverso da come suonano:

| Termine | Cos'è | Dove si vede |
| --- | --- | --- |
| **Tunnel** | l'oggetto a cui dai un nome | Zero Trust → Networks → Tunnels |
| **Connettore** (*connector*) | un'istanza di `cloudflared` agganciata al tunnel — qui, il container omonimo | righe dentro il tunnel, con id, versione e stato |
| **Token** | dice al connettore a quale tunnel agganciarsi | nel comando di installazione del tunnel |

Non esiste una voce di menu chiamata «connettore»: si apre il **tunnel** e
si prende il token dal comando che la dashboard mostra.

Dalla dashboard, **Zero Trust → Networks → Tunnels → Create a tunnel →
Cloudflared**:

1. Nome `ergocheck`, poi **Save**.
2. Nella schermata di installazione copia il **token**: nel comando
   mostrato (`cloudflared service install eyJhIjoi…`) è la stringa che
   segue `install`, o `--token` se il comando la riporta così. Solo
   quella, senza il resto della riga. Non installare cloudflared a mano:
   lo esegue un container.

   Se hai già chiuso quella schermata, si ritrova cliccando sul tunnel e
   poi su **Configure**.
3. **Public Hostname → Add a public hostname**, uno solo:

   | Campo | Valore |
   | --- | --- |
   | Subdomain | *(vuoto)* |
   | Domain | `syntaxnode.work` |
   | Type | `HTTP` |
   | URL | `tma:80` |

   `tma` è il nome del servizio nella rete di compose: il connettore lo
   raggiunge direttamente, senza passare dalle porte pubblicate sull'host.

Incolla il token nel `.env` della radice, quello copiato prima:

```
CLOUDFLARE_TUNNEL_TOKEN=<token>
```

Attenzione a non metterlo in `backend/.env`: lì compose non lo cercherebbe
e l'avvio si fermerebbe con `serve CLOUDFLARE_TUNNEL_TOKEN`. Entrambi i
file sono in `.gitignore`.

## 4. Avvio

```bash
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml up -d --build
```

Il primo build scarica i modelli MediaPipe (circa 17 MB) dentro l'immagine
della Mini App: richiede qualche minuto. Poi:

```bash
docker compose exec ergo-api python manage.py createsuperuser
```

### Se cloudflared dice «Provided Tunnel token is not valid»

```bash
python3 deploy/check-tunnel-token.py
```

Controlla la forma del token senza stamparlo. Le cause, in ordine di
frequenza:

1. **È il token API invece di quello del connettore.** Il token API inizia
   con `cfat_`, quello del tunnel con `eyJ` (è il base64 di un JSON).
   Servono a cose diverse e non sono intercambiabili.
2. **È stato copiato un pezzo del comando** invece della sola stringa dopo
   `--token`, oppure il terminale lo ha troncato a capo.
3. **Virgolette o spazi** attorno al valore nel `.env`.
4. **Il tunnel è stato cancellato e ricreato**: il token vecchio non vale
   più, va ripreso dalla dashboard.
5. **Il tunnel è stato creato da riga di comando** (`cloudflared tunnel
   create`): quello è un tunnel a gestione locale, non ha un token di
   connettore. O lo si ricrea dalla dashboard, o si segue il percorso con
   `config.yml` descritto in [`tunnel.md`](tunnel.md).

Il token si prende da **Zero Trust → Networks → Tunnels → il tuo tunnel →
Configure**: nel comando di installazione mostrato, è la stringa che segue
`--token`.

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
