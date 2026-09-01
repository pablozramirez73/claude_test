"""
Settings usati dalla suite di test.

Le variabili sono impostate prima di importare `config.settings` perche'
quest'ultimo legge l'ambiente al momento dell'import.
"""
import os
import tempfile

os.environ.setdefault("DJANGO_SECRET_KEY", "test-secret")
os.environ.setdefault("DEBUG", "True")
os.environ.setdefault("TELEGRAM_BOT_TOKEN", "123456:TEST-TOKEN")
os.environ.setdefault("TELEGRAM_WEBHOOK_SECRET", "test-webhook-secret")
os.environ.setdefault("DATABASE_URL", "sqlite:///test.sqlite3")

from .settings import *  # noqa: F403,E402

DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"}}

# Niente Redis in test: cache locale, canale in memoria, task sincroni.
CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
CHANNEL_LAYERS = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}
CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True

MEDIA_ROOT = tempfile.mkdtemp(prefix="ergocheck-test-media-")
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
}

PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]

# Rate limit alzati: i test creano molte valutazioni di fila.
REST_FRAMEWORK = {  # noqa: F405
    **REST_FRAMEWORK,  # noqa: F405
    "DEFAULT_THROTTLE_RATES": {
        "assessment_create": "10000/hour",
        "report_generate": "10000/hour",
    },
}
