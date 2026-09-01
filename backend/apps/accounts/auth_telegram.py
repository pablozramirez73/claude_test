"""
Verifica di `initData` della Telegram Mini App.

Algoritmo ufficiale (Telegram Bot API, Mini Apps):

    secret_key       = HMAC_SHA256(key="WebAppData", msg=bot_token)
    data_check_string = "\\n".join(f"{k}={v}" for k, v in sorted(pairs) if k != "hash")
    expected          = HMAC_SHA256(key=secret_key, msg=data_check_string).hexdigest()

Il confronto con l'hash ricevuto avviene in tempo costante. Oltre alla firma
viene verificata l'età di `auth_date`: una initData valida ma vecchia è un
replay, quindi viene rifiutata dopo TELEGRAM_INITDATA_MAX_AGE.
"""
from __future__ import annotations

import hashlib
import hmac
import json
from dataclasses import dataclass, field
from datetime import UTC, datetime
from urllib.parse import parse_qsl

from django.conf import settings


class InitDataError(Exception):
    """initData assente, malformata, scaduta o con firma non valida."""


@dataclass
class TelegramInitData:
    """Payload verificato di una Mini App."""

    user: dict = field(default_factory=dict)
    chat: dict = field(default_factory=dict)
    auth_date: datetime | None = None
    query_id: str = ""
    start_param: str = ""
    raw: dict = field(default_factory=dict)

    @property
    def telegram_id(self) -> int:
        try:
            return int(self.user["id"])
        except (KeyError, TypeError, ValueError) as exc:
            raise InitDataError("initData priva del campo user.id") from exc


def _secret_key(bot_token: str) -> bytes:
    return hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()


def compute_hash(init_data: str, bot_token: str) -> str:
    """Ricalcola l'hash atteso per una stringa initData."""
    pairs = [(k, v) for k, v in parse_qsl(init_data, keep_blank_values=True) if k != "hash"]
    if not pairs:
        raise InitDataError("initData vuota")
    data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(pairs))
    return hmac.new(
        _secret_key(bot_token), data_check_string.encode(), hashlib.sha256
    ).hexdigest()


def verify_init_data(
    init_data: str,
    bot_token: str | None = None,
    max_age=None,
) -> TelegramInitData:
    """Verifica firma e freschezza di initData; solleva InitDataError se non valida."""
    if not init_data:
        raise InitDataError("initData mancante")

    bot_token = bot_token if bot_token is not None else settings.TELEGRAM_BOT_TOKEN
    if not bot_token:
        raise InitDataError("TELEGRAM_BOT_TOKEN non configurato sul server")

    parsed = dict(parse_qsl(init_data, keep_blank_values=True))
    received_hash = parsed.get("hash", "")
    if not received_hash:
        raise InitDataError("initData priva di hash")

    expected_hash = compute_hash(init_data, bot_token)
    if not hmac.compare_digest(expected_hash, received_hash):
        raise InitDataError("Firma initData non valida")

    max_age = max_age if max_age is not None else settings.TELEGRAM_INITDATA_MAX_AGE
    auth_date = None
    if parsed.get("auth_date"):
        try:
            auth_date = datetime.fromtimestamp(int(parsed["auth_date"]), tz=UTC)
        except (ValueError, OSError) as exc:
            raise InitDataError("auth_date non valida") from exc
        if max_age is not None:
            age = datetime.now(UTC) - auth_date
            if age > max_age:
                raise InitDataError("initData scaduta, riapri la Mini App")

    def _json_field(name):
        raw_value = parsed.get(name)
        if not raw_value:
            return {}
        try:
            return json.loads(raw_value)
        except json.JSONDecodeError as exc:
            raise InitDataError(f"Campo {name} non è JSON valido") from exc

    return TelegramInitData(
        user=_json_field("user"),
        chat=_json_field("chat"),
        auth_date=auth_date,
        query_id=parsed.get("query_id", ""),
        start_param=parsed.get("start_param", ""),
        raw=parsed,
    )


def upsert_user_from_init_data(data: TelegramInitData):
    """Crea o aggiorna il TelegramUser corrispondente al payload verificato."""
    from django.utils import timezone

    from .models import TelegramUser

    profile = data.user
    defaults = {
        "username": (profile.get("username") or "")[:64],
        "first_name": (profile.get("first_name") or "")[:120],
        "last_name": (profile.get("last_name") or "")[:120],
        "language_code": (profile.get("language_code") or "it")[:8],
        "photo_url": profile.get("photo_url") or "",
        "is_premium": bool(profile.get("is_premium", False)),
        "last_seen_at": timezone.now(),
    }
    user, _created = TelegramUser.objects.update_or_create(
        telegram_id=data.telegram_id, defaults=defaults
    )
    return user
