"""Endpoint webhook del bot Telegram."""
import asyncio
import json
import logging

from django.conf import settings
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

logger = logging.getLogger(__name__)


class TelegramWebhookView(APIView):
    """
    Riceve gli update di Telegram. La richiesta e' autenticata dal token
    segreto concordato in setWebhook (header X-Telegram-Bot-Api-Secret-Token).
    """

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        secret = settings.TELEGRAM_WEBHOOK_SECRET
        if secret and request.META.get("HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN") != secret:
            return Response({"detail": "forbidden"}, status=status.HTTP_403_FORBIDDEN)

        try:
            payload = json.loads(request.body or b"{}")
        except json.JSONDecodeError:
            return Response({"detail": "invalid json"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            asyncio.run(self._process(payload))
        except Exception:
            # Un errore qui non deve far ritentare Telegram all'infinito.
            logger.exception("Errore nel processare l'update Telegram")
        return Response({"ok": True})

    async def _process(self, payload):
        from telegram import Update

        from .handlers import build_application

        application = build_application()
        await application.initialize()
        try:
            await application.process_update(Update.de_json(payload, application.bot))
        finally:
            await application.shutdown()
