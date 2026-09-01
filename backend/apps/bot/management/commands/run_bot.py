"""Avvia il bot in long polling (sviluppo e piccoli deployment)."""
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Avvia il bot Telegram di ErgoCheck in modalità polling."

    def handle(self, *args, **options):
        if not settings.TELEGRAM_BOT_TOKEN:
            raise CommandError("TELEGRAM_BOT_TOKEN non configurato.")

        from apps.bot.handlers import build_application

        self.stdout.write(self.style.SUCCESS("Bot ErgoCheck in ascolto..."))
        build_application().run_polling(drop_pending_updates=True)
