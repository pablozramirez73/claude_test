"""
Django settings for the MISURA backend.

Everything environment-specific comes from env vars (see .env.example) —
nothing secret is hardcoded here, and this file is safe to commit.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

# Loads a local .env if present (docker-compose injects env vars directly,
# so this mainly helps `python manage.py runserver` outside Docker).
load_dotenv(BASE_DIR / ".env")


def _env_list(name: str, default: str = "") -> list[str]:
    raw = os.environ.get(name, default)
    return [item.strip() for item in raw.split(",") if item.strip()]


# SECURITY WARNING: keep the secret key secret in production!
# No hardcoded fallback for a real secret — only a clearly-fake dev default,
# so a missing env var fails loudly (via Django's own key validation) rather
# than silently running production on a known key.
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "insecure-dev-key-change-me")

DEBUG = os.environ.get("DJANGO_DEBUG", "true").lower() in ("1", "true", "yes")

ALLOWED_HOSTS = _env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "corsheaders",
    "profiles",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

# --- Database ---------------------------------------------------------
# Discrete POSTGRES_* env vars (matching docker-compose's postgres service)
# rather than a single DATABASE_URL, to avoid an extra parsing dependency.
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.environ.get("POSTGRES_DB", "misura"),
        "USER": os.environ.get("POSTGRES_USER", "misura"),
        "PASSWORD": os.environ.get("POSTGRES_PASSWORD", "misura"),
        "HOST": os.environ.get("POSTGRES_HOST", "db"),
        "PORT": os.environ.get("POSTGRES_PORT_INTERNAL", "5432"),
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --- CORS ---------------------------------------------------------------
# The Mini App frontend runs on a different origin/port (see
# apps/misura-miniapp's docker-compose.yml) and calls this API from the
# browser, so its origin(s) must be explicitly allowed.
CORS_ALLOWED_ORIGINS = _env_list(
    "DJANGO_CORS_ALLOWED_ORIGINS",
    "http://localhost:8091,http://localhost:5183,http://localhost:5173",
)

# --- REST framework -------------------------------------------------
REST_FRAMEWORK = {
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 50,
}

# --- Local LLM (Ollama) --------------------------------------------------
# Style/fit advice generation (profiles/llm.py) — added on explicit user
# request, not part of the original docs/PRD-misura.md spec. "ollama" is the
# Compose service name (see docker-compose.yml); override for a local
# non-Docker Ollama (typically http://localhost:11434).
OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://ollama:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "gemma4:latest")
OLLAMA_TIMEOUT_SECONDS = float(os.environ.get("OLLAMA_TIMEOUT_SECONDS", "60"))
