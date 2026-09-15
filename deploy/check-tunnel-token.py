#!/usr/bin/env python3
"""
Verifica la forma del token del tunnel senza stamparlo.

    python3 deploy/check-tunnel-token.py

Un token di connettore e' il base64 di un JSON con i campi a (account),
t (tunnel) e s (segreto). Se il valore non si decodifica cosi', cloudflared
risponde "Provided Tunnel token is not valid" qualunque sia la causa.
"""
import base64
import json
import pathlib
import re
import sys

ENV = pathlib.Path(__file__).resolve().parent.parent / ".env"

if not ENV.exists():
    sys.exit(f"{ENV} non esiste: copialo da .env.example")

riga = next(
    (r for r in ENV.read_text().splitlines() if r.startswith("CLOUDFLARE_TUNNEL_TOKEN=")),
    None,
)
if riga is None:
    sys.exit("CLOUDFLARE_TUNNEL_TOKEN assente dal .env di radice")

grezzo = riga.split("=", 1)[1]
token = grezzo.strip().strip('"').strip("'")

print(f"lunghezza        : {len(token)}")
print(f"primi caratteri  : {token[:4] if token else '(vuoto)'}")

if grezzo != token:
    print("nota             : il valore ha spazi o virgolette attorno, vengono ignorati qui")

anomali = sorted(set(re.findall(r"[^A-Za-z0-9+/=_-]", token)))
if anomali:
    print(f"caratteri anomali: {anomali}  <- il token non dovrebbe contenerli")

if token.startswith("cfat_") or token.startswith("v1."):
    sys.exit(
        "\nQuesto e' un token API di Cloudflare, non il token del connettore.\n"
        "Il token del tunnel si prende da Zero Trust -> Networks -> Tunnels ->\n"
        "il tuo tunnel -> Configure, dentro il comando di installazione."
    )

try:
    dati = json.loads(base64.b64decode(token + "=" * (-len(token) % 4)))
except Exception as errore:
    sys.exit(
        f"\nNon e' un token di tunnel: {errore}\n"
        "Ricopialo da Zero Trust -> Networks -> Tunnels -> Configure, prendendo\n"
        "solo la stringa dopo --token (inizia con eyJ), senza il resto del comando."
    )

if not isinstance(dati, dict) or not {"a", "t", "s"} <= set(dati):
    sys.exit(f"\nToken decodificato ma con campi inattesi: {sorted(dati)}")

print(f"account          : {dati['a'][:6]}…")
print(f"tunnel           : {dati['t']}")
print("\nToken valido nella forma. Se cloudflared lo rifiuta ancora, il tunnel")
print("e' stato cancellato o ricreato: prendi il token nuovo dalla dashboard.")
