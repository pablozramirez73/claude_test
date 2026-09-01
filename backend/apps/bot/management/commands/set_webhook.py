"""Registra l'URL del webhook presso Telegram."""
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Imposta il webhook del bot verso l'endpoint pubblico dell'API."

    def add_arguments(self, parser):
        parser.add_argument("url", help="URL pubblico, es. https://api.ergocheck.it/api/v1/bot/webhook/")

    def handle(self, *args, **options):
        if not settings.TELEGRAM_BOT_TOKEN:
            raise CommandError("TELEGRAM_BOT_TOKEN non configurato.")

        from apps.bot.client import set_webhook

        result = set_webhook(options["url"], settings.TELEGRAM_WEBHOOK_SECRET)
        self.stdout.write(self.style.SUCCESS(f"Webhook impostato: {result}"))
