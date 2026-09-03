"""
Settings per l'esecuzione in locale senza PostgreSQL, Redis e S3.

Serve a far girare l'API su una macchina di sviluppo (o in un container di
prova) con le sole dipendenze Python: SQLite come database, cache e channel
layer in memoria, task Celery eseguiti in linea. Per il deployment reale si
usa `config.settings` con le variabili di ambiente di .env.
"""
import os

os.environ.setdefault("DJANGO_SECRET_KEY", "dev-only-insecure-key")
os.environ.setdefault("DEBUG", "True")
os.environ.setdefault("DATABASE_URL", "sqlite:///dev.sqlite3")
os.environ.setdefault("TELEGRAM_BOT_TOKEN", "123456:DEV-TOKEN")
os.environ.setdefault("ALLOWED_HOSTS", "localhost,127.0.0.1,0.0.0.0")
os.environ.setdefault("CORS_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")

from .settings import *  # noqa: F403,E402

# SQLite serializza le scritture: con un server ASGI che serve richieste in
# parallelo serve un timeout sull'attesa del lock, altrimenti si prende
# "database is locked". Il journal WAL si abilita una volta sola sul file
# (l'impostazione e' persistente): vedi `manage.py sqlite_wal`.
DATABASES["default"].setdefault("OPTIONS", {})  # noqa: F405
DATABASES["default"]["OPTIONS"]["timeout"] = 20  # noqa: F405

CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
CHANNEL_LAYERS = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}

# Senza broker i report PDF si generano in linea, dentro la richiesta.
CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = False

STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
}
