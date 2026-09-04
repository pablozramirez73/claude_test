# Far girare tutto in locale con Docker

Percorso pensato per chi non ha un server: il computer di casa esegue
l'intera applicazione — Mini App, API, PostgreSQL, Redis, worker e bot — e
Cloudflare Tunnel la pubblica su `ergo.syntaxnode.work` senza aprire porte sul
router. Niente Cloudflare Pages, niente PostgreSQL o Redis installati a
livello di sistema: tutto in container.

## Come è messa insieme

```
 Telegram ──► ergo.syntaxnode.work ──► tunnel ──► container `tma` (nginx)
                                                    │
                                                    ├── /            Mini App compilata
                                                    └── /api/ /ws/   ──► ergo-api:7000
                                                        /admin/ /media/     (daphne)
                                                                             │
                                                                 db · redis · worker · beat · bot
```

L'hostname pubblico e' l'unica cosa da cambiare per pubblicare l'app
altrove: la Mini App chiama l'API con URL relativi, quindi non va
ricompilata quando il dominio cambia. Lato server basta allineare
`ALLOWED_HOSTS`, `CSRF_TRUSTED_ORIGINS` e `TMA_URL` in `backend/.env`.

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
ALLOWED_HOSTS=ergo.syntaxnode.work,localhost,127.0.0.1
CSRF_TRUSTED_ORIGINS=https://ergo.syntaxnode.work
TMA_URL=https://ergo.syntaxnode.work
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
   | Subdomain | `ergo` |
   | Domain | `syntaxnode.work` |
   | Path | *(vuoto)* |
   | Type | `HTTP` |
   | URL | `tma:80` |

   Tre punti in cui è facile sbagliare:

   - **`Type` è `HTTP`, non `HTTPS`.** nginx dentro il container ascolta in
     chiaro sulla 80; il TLS lo termina Cloudflare. Scegliendo HTTPS il
     tunnel tenta una connessione cifrata verso un servizio che non la
     parla, e la risposta è 502.
   - **`URL` è `tma:80`**, il nome del servizio nella rete di compose, non
     `localhost:5190`: il connettore gira nello stesso network e raggiunge
     il container direttamente. `localhost`, per lui, è il proprio
     container. (Se invece avessi installato cloudflared sull'host e non
     come container, lì sarebbe `localhost:5190`.)
   - Il **record DNS lo crea Cloudflare** al salvataggio. Se sul dominio
     esiste già un record per la radice — per esempio da un tentativo
     precedente con Pages — il salvataggio viene rifiutato: cancella
     quel record da **DNS → Records** e riprova.

   Finché non aggiungi l'hostname pubblico il tunnel risulta connesso ma
   non instrada nulla: è normale che `ergo.syntaxnode.work` non risponda.

Incolla il token nel `.env` della radice, quello copiato prima:

```
CLOUDFLARE_TUNNEL_TOKEN=<token>
```

Attenzione a non metterlo in `backend/.env`: lì compose non lo cercherebbe
e l'avvio si fermerebbe con `serve CLOUDFLARE_TUNNEL_TOKEN`. Entrambi i
file sono in `.gitignore`.

## 4. Avvio

```bash
docker compose up -d --build
```

Il `.env` copiato al passo 2 contiene `COMPOSE_FILE`, quindi l'override del
tunnel viene incluso da solo. Senza quella riga servirebbe passarlo ogni
volta a mano:

```bash
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml up -d --build
```

ed è un errore che non si nota: lo stack parte regolarmente, ma senza il
connettore, e il dominio resta irraggiungibile. Per verificare che il
container ci sia:

```bash
docker compose ps cloudflared
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
curl https://ergo.syntaxnode.work/healthz/
curl -I https://ergo.syntaxnode.work/

# 4. il tunnel è sano
docker compose logs cloudflared | tail -20
```

Nei log del connettore devi vedere alcune righe `Registered tunnel
connection` (di norma quattro, verso datacenter diversi) e nella dashboard
il tunnel deve risultare **HEALTHY**.

Se il tunnel è HEALTHY ma il dominio non risponde come dovrebbe, la prima
cosa da stabilire è **se la richiesta arriva ai container**:

```bash
curl -s https://ergo.syntaxnode.work/healthz/ >/dev/null
docker compose logs --tail=20 tma
```

Se nei log di nginx non compare la richiesta, sta rispondendo qualcos'altro
prima del tunnel e le voci qui sotto dicono cosa.

| Sintomo | Causa quasi sempre |
| --- | --- |
| **1033** o «Tunnel not found» | hostname pubblico non configurato, o record DNS che punta altrove |
| **502 Bad Gateway** | `Type` impostato su HTTPS invece di HTTP, oppure il container `tma` non è partito (`docker compose ps`) |
| **404 su tutto** | `URL` sbagliato nell'hostname pubblico: deve essere `tma:80` |
| Risponde **«hello world»** o una pagina di prova Cloudflare | `Type` impostato su *Hello World*, il servizio di prova incorporato in cloudflared: la richiesta non arriva mai ai container. Oppure un Worker con una route su quell'hostname, che ha la precedenza sul tunnel |
| Risponde la **pagina di un altro server** (Caddy, Apache, nginx di sistema) | il connettore sta raggiungendo un servizio dell'host invece del container: vedi sotto |
| Le risposte **cambiano a ogni richiesta** | più connettori agganciati allo stesso tunnel, e Cloudflare distribuisce fra loro |

### «hello world»: capire se intercetta prima del tunnel o dopo

Il sintomo «hello world» ha due cause molto diverse fra loro, e vanno
distinte prima di mettersi a cercare nel posto sbagliato:

```bash
curl -s https://ergo.syntaxnode.work/favicon.svg
```

- **Torna ancora «hello world»** → l'intercettazione è a monte del
  tunnel, su *tutti* i percorsi. Guarda, in ordine di probabilità:
  1. **DNS → Records**: la voce `ergo` deve essere un **CNAME** verso
     `<uuid>.cfargotunnel.com`, proxied. Se punta a un `*.workers.dev`,
     un IP o altro, cancellala e lascia che sia l'hostname pubblico del
     tunnel a ricrearla.
  2. **syntaxnode.work → Workers Routes** (livello di zona): cerca
     `ergo.syntaxnode.work/*` o, peggio, `*.syntaxnode.work/*` — il
     wildcard cattura anche questo sottodominio.
  3. **Workers & Pages** → ogni progetto → *Settings → Domains &
     Routes*: verifica che nessuno abbia agganciato
     `ergo.syntaxnode.work` come dominio personalizzato.
- **Torna il file** → il problema è ristretto all'hostname pubblico del
  tunnel stesso: `Type` è finito su *Hello World* (vedi la riga sopra), o
  c'è una seconda voce per lo stesso hostname che vince sulla prima.

### Il connettore raggiunge il server sbagliato

Il valore di `URL` nell'hostname pubblico va letto **dal punto di vista di
chi esegue cloudflared**, e cambia a seconda di dove gira:

| cloudflared gira… | `URL` corretto | Perché |
| --- | --- | --- |
| come container (`docker-compose.tunnel.yml`) | `tma:80` | sta nella rete di compose e risolve i servizi per nome; `localhost` per lui è sé stesso |
| installato sull'host | `localhost:5190` | deve passare dalla porta pubblicata del container |

Se sull'host gira già un altro web server sulla porta 80 — Caddy, Apache,
nginx di sistema — e l'`URL` è `localhost:80`, il tunnel finisce lì. È il
caso in cui compare la pagina di benvenuto di quel server.

Verifica dove sta il connettore:

```bash
docker compose ps cloudflared          # come container
systemctl status cloudflared           # come servizio di sistema (Linux)
brew services list | grep cloudflared  # macOS
```

In PowerShell:

```powershell
docker compose ps cloudflared
Get-Service   cloudflared -ErrorAction SilentlyContinue
Get-Process   cloudflared -ErrorAction SilentlyContinue

# Chi occupa la porta 80 dell'host (di solito il server che risponde al
# posto dell'applicazione)
Get-Process -Id (Get-NetTCPConnection -LocalPort 80 -State Listen).OwningProcess
```

Attenzione, in PowerShell `curl` è un alias di `Invoke-WebRequest`, che ha
opzioni diverse: per i comandi di verifica di questa guida usa
`curl.exe`.

**Se rispondono entrambi**, hai due connettori sullo stesso tunnel e le
richieste si dividono fra loro: le risposte cambiano da una chiamata
all'altra. Ferma quello che non ti serve:

```bash
sudo cloudflared service uninstall     # rimuove quello installato sull'host
```

In PowerShell, da una finestra **come amministratore**:

```powershell
cloudflared service uninstall
```

Nella dashboard, dentro il tunnel, l'elenco dei connettori deve mostrarne
uno solo.

Se invece vuoi tenere Caddy come porta d'ingresso dell'host, lascia
`URL` a `localhost:80` e fai inoltrare Caddy al container:

```caddyfile
ergo.syntaxnode.work {
    reverse_proxy 127.0.0.1:5190
}
```
| La Mini App si apre ma le chiamate falliscono | `ALLOWED_HOSTS` in `backend/.env` non contiene `ergo.syntaxnode.work` |
| **400** su ogni rotta, con corpo di 154 byte | è `DisallowedHost`: l'Host della richiesta non è in `ALLOWED_HOSTS`. Capita tipicamente provando da `127.0.0.1:5190`, che va elencato anche lui. Se l'hai già corretto e resta 400, il container non ha riletto il file: serve `up -d --force-recreate`, non `restart` |

Apri poi `https://ergo.syntaxnode.work` in un browser: deve comparire la
schermata di registrazione dell'azienda. Fuori da Telegram non c'è
`initData`, quindi le chiamate all'API rispondono 401: è il comportamento
atteso. La prova vera si fa aprendo la Mini App dal bot.

## 6. Il bot

Su [@BotFather](https://t.me/BotFather): `/newapp` sul bot, URL della Mini
App `https://ergo.syntaxnode.work`. Poi aggiungi il bot al gruppo aziendale e
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

# Dopo modifiche a backend/.env. `restart` NON basta: riavvia il container
# con l'ambiente che aveva gia', quindi il file non viene riletto.
docker compose up -d --force-recreate ergo-api worker beat bot

# Cosa vede davvero il container:
docker compose exec ergo-api printenv ALLOWED_HOSTS
docker compose down                        # ferma tutto (i dati restano)
docker compose exec db pg_dump -U ergocheck ergocheck > backup.sql
```

Dopo un `git pull`:

```bash
docker compose up -d --build
```

Le modifiche alla Mini App richiedono la ricostruzione dell'immagine `tma`:
il codice viene compilato dentro il container, non montato.
