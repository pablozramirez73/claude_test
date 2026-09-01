"""Client HTTP minimale per la Bot API di Telegram.

Usato dai task Celery per recapitare report e notifiche senza dover
istanziare l'applicazione asincrona di python-telegram-bot.
"""
from __future__ import annotations

import logging

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

API_BASE = "https://api.telegram.org/bot{token}/{method}"
TIMEOUT = 30


class TelegramError(RuntimeError):
    pass


def _call(method: str, *, data=None, files=None, token: str | None = None) -> dict:
    token = token or settings.TELEGRAM_BOT_TOKEN
    if not token:
        raise TelegramError("TELEGRAM_BOT_TOKEN non configurato")

    response = requests.post(
        API_BASE.format(token=token, method=method), data=data, files=files, timeout=TIMEOUT
    )
    try:
        payload = response.json()
    except ValueError as exc:
        raise TelegramError(f"Risposta non JSON da Telegram ({response.status_code})") from exc

    if not payload.get("ok"):
        raise TelegramError(payload.get("description", "Errore Telegram sconosciuto"))
    return payload["result"]


def send_message(chat_id: int, text: str, *, parse_mode="HTML", reply_markup=None) -> dict:
    data = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": parse_mode,
        "disable_web_page_preview": True,
    }
    if reply_markup is not None:
        import json

        data["reply_markup"] = json.dumps(reply_markup)
    return _call("sendMessage", data=data)


def send_document(chat_id: int, filename: str, content: bytes, caption: str = "") -> dict:
    return _call(
        "sendDocument",
        data={"chat_id": chat_id, "caption": caption[:1024], "parse_mode": "HTML"},
        files={"document": (filename, content, "application/pdf")},
    )


def answer_web_app_query(query_id: str, result: dict) -> dict:
    import json

    return _call("answerWebAppQuery", data={"web_app_query_id": query_id, "result": json.dumps(result)})


def set_webhook(url: str, secret_token: str = "") -> dict:
    data = {"url": url, "allowed_updates": '["message","callback_query","my_chat_member"]'}
    if secret_token:
        data["secret_token"] = secret_token
    return _call("setWebhook", data=data)
