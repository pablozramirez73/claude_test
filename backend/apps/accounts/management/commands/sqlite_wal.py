"""Abilita il journal WAL sul database SQLite di sviluppo."""
from django.core.management.base import BaseCommand, CommandError
from django.db import connection


class Command(BaseCommand):
    help = (
        "Imposta PRAGMA journal_mode=WAL sul database SQLite. "
        "L'impostazione e' persistente sul file: va eseguita una volta sola."
    )

    def handle(self, *args, **options):
        if connection.vendor != "sqlite":
            raise CommandError(f"Comando valido solo su SQLite (attuale: {connection.vendor}).")

        with connection.cursor() as cursor:
            cursor.execute("PRAGMA journal_mode=WAL;")
            mode = cursor.fetchone()[0]
        self.stdout.write(self.style.SUCCESS(f"journal_mode = {mode}"))
