# Cloudflare Tunnel per `api.syntaxnode.work`

Il VPS apre una connessione **in uscita** verso Cloudflare. Conseguenze:

- nessuna porta in ingresso aperta: la 443 del server resta chiusa;
- nessun Origin Certificate da installare e rinnovare — il TLS lo termina
  Cloudflare, e fra Cloudflare e il server viaggia il tunnel;
- funziona dietro NAT, con IP dinamico o senza IP pubblico;
- l'indirizzo del server non è esposto: niente da schermare a mano.

Il canale WebSocket degli aggiornamenti di stato del report passa dal
tunnel senza configurazione aggiuntiva.

## Quale dei due modelli

| | Locale (`config.yml`) | Remoto (token) |
| --- | --- | --- |
| Dove sta la configurazione | file sul server, versionabile | dashboard Cloudflare |
| Modifica alle regole | edita il file e riavvia | immediata, senza riavvio |
| Adatto a | un server, config sotto git | più connettori, container |

Sotto trovi entrambe. Il file `cloudflared-config.yml` di questo repository
è per il modello **locale**: in modalità remota viene ignorato, perché le
regole di ingress arrivano dalla dashboard.

## A. Modello locale (configurazione nel repository)

```bash
# 1. sul VPS: installa cloudflared (Debian/Ubuntu)
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg \
  | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" \
  | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt update && sudo apt install cloudflared

# 2. autenticazione: apre il browser, scegli la zona syntaxnode.work
cloudflared tunnel login          # scrive ~/.cloudflared/cert.pem

# 3. crea il tunnel: stampa l'UUID e scrive il file di credenziali
cloudflared tunnel create ergocheck-api

# 4. record DNS: CNAME proxied verso <UUID>.cfargotunnel.com, creato da Cloudflare
cloudflared tunnel route dns ergocheck-api api.syntaxnode.work

# 5. configurazione: copia il file del repository e sostituisci <TUNNEL_ID>
sudo mkdir -p /etc/cloudflared
sudo cp deploy/cloudflared-config.yml /etc/cloudflared/config.yml
sudo cp ~/.cloudflared/<UUID>.json /etc/cloudflared/
sudo sed -i "s/<TUNNEL_ID>/<UUID>/g" /etc/cloudflared/config.yml

# 6. verifica la configurazione prima di installare il servizio
cloudflared tunnel ingress validate
cloudflared tunnel ingress rule https://api.syntaxnode.work/healthz/

# 7. servizio di sistema
sudo cloudflared service install
sudo systemctl enable --now cloudflared
```

## B. Modello remoto (token dalla dashboard)

1. *Zero Trust → Networks → Tunnels → Create a tunnel → Cloudflared*
2. Nome: `ergocheck-api`. La dashboard mostra il comando di installazione
   con il token già dentro: eseguilo sul VPS.
3. *Public Hostname → Add a public hostname*:

   | Campo | Valore |
   | --- | --- |
   | Subdomain | `api` |
   | Domain | `syntaxnode.work` |
   | Type | `HTTP` |
   | URL | `localhost:8000` (o `localhost:8080` con nginx) |

Il record DNS lo crea Cloudflare. In questo modello `config.yml` non viene
letto: le regole stanno nella dashboard.

## Cosa cambia nel resto della configurazione

- **nginx**: non serve più esporre la 443. Se i report vanno su R2, il
  tunnel punta direttamente a daphne e nginx si può togliere del tutto —
  gli statici dell'admin li serve whitenoise. Se i report restano su disco,
  usa `nginx-api-tunnel.conf`, che ascolta solo su `127.0.0.1:8080`.
- **Origin Certificate**: non serve. `nginx-api.conf` (con TLS e i range di
  Cloudflare) resta nel repository per chi preferisce il record A classico.
- **Firewall**: chiudi la 443 e la 80 in ingresso. Lascia solo la porta SSH,
  possibilmente anch'essa dietro il tunnel.
- **`.env`**: nessuna modifica. `SECURE_SSL_REDIRECT=False` resta corretto —
  il redirect a https lo fa Cloudflare con *Always Use HTTPS* — e
  `SECURE_PROXY_SSL_HEADER` riconosce già l'`X-Forwarded-Proto` che
  cloudflared imposta.

## Verifica

```bash
sudo systemctl status cloudflared        # connettore registrato
cloudflared tunnel info ergocheck-api    # connessioni attive

curl https://api.syntaxnode.work/healthz/
# -> {"status": "ok", "service": "ergocheck"}

# Il preflight della Mini App deve dichiarare l'header di initData:
curl -sI -X OPTIONS https://api.syntaxnode.work/api/v1/me/ \
  -H "Origin: https://syntaxnode.work" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: x-telegram-init-data" \
  | grep -i access-control-allow-headers
```

Dalla dashboard, *Zero Trust → Networks → Tunnels*, il tunnel deve
risultare **HEALTHY** con almeno due connessioni attive.
