from django.urls import path

from .views import TelegramWebhookView

urlpatterns = [
    path("bot/webhook/", TelegramWebhookView.as_view(), name="bot-webhook"),
]
