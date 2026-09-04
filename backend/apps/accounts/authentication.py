"""Classe di autenticazione DRF basata su initData Telegram."""
from rest_framework import authentication, exceptions

from .auth_telegram import InitDataError, upsert_user_from_init_data, verify_init_data

HEADER = "HTTP_X_TELEGRAM_INIT_DATA"
AUTH_SCHEME = "tma"


class TelegramInitDataAuthentication(authentication.BaseAuthentication):
    """
    Accetta initData da:
      * header `X-Telegram-Init-Data: <initData>`
      * header `Authorization: tma <initData>`

    Ogni richiesta è autoconsistente: non ci sono sessioni lato server, la
    firma HMAC viene verificata a ogni chiamata.
    """

    def authenticate(self, request):
        raw = request.META.get(HEADER)
        if not raw:
            header = authentication.get_authorization_header(request).decode("latin-1")
            if header.lower().startswith(f"{AUTH_SCHEME} "):
                raw = header[len(AUTH_SCHEME) + 1 :].strip()
        if not raw:
            return None  # lascia provare le altre classi di autenticazione

        try:
            data = verify_init_data(raw)
        except InitDataError as exc:
            raise exceptions.AuthenticationFailed(str(exc)) from exc

        user = upsert_user_from_init_data(data)
        if not user.is_active:
            raise exceptions.AuthenticationFailed("Utente disattivato")

        request.telegram_init_data = data
        return (user, data)

    def authenticate_header(self, request):
        return AUTH_SCHEME
