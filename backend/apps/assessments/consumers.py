"""
Canale WebSocket della Mini App.

La TMA si collega a /ws/assessments/?initData=<...> e riceve gli aggiornamenti
di stato (report pronto, PDF disponibile) senza polling. L'autenticazione usa
la stessa firma HMAC delle chiamate REST.
"""
import json
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer

from apps.accounts.auth_telegram import (
    InitDataError,
    upsert_user_from_init_data,
    verify_init_data,
)


class AssessmentConsumer(AsyncJsonWebsocketConsumer):
    group_name = None

    async def connect(self):
        query = parse_qs(self.scope.get("query_string", b"").decode())
        init_data = (query.get("initData") or [""])[0]

        try:
            user = await self._authenticate(init_data)
        except InitDataError:
            await self.close(code=4401)  # unauthorized
            return

        if not user.company_id:
            await self.close(code=4403)  # nessuna azienda associata
            return

        self.group_name = f"company_{user.company_id}"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        await self.send_json({"type": "connected", "company_id": user.company_id})

    async def disconnect(self, code):
        if self.group_name:
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive(self, text_data=None, bytes_data=None):
        # Il canale e' di sola lettura: si risponde solo al ping di keepalive.
        try:
            payload = json.loads(text_data or "{}")
        except json.JSONDecodeError:
            return
        if payload.get("type") == "ping":
            await self.send_json({"type": "pong"})

    async def assessment_update(self, event):
        await self.send_json({"type": "assessment.update", **event["payload"]})

    @database_sync_to_async
    def _authenticate(self, init_data):
        data = verify_init_data(init_data)
        return upsert_user_from_init_data(data)
