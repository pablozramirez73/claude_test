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
    # "unfold" must come before "django.contrib.admin" — its AppConfig
    # swaps admin.site for a themed UnfoldAdminSite on startup. See
    # profiles/admin.py and profiles/dashboard.py for the admin dashboard
    # this powers.
    "unfold",
    "unfold.contrib.filters",
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.humanize",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "corsheaders",
    "profiles",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    # Serves static files (admin/Unfold CSS+JS, ...) directly from gunicorn
    # in production — DEBUG=True/runserver already does this on its own,
    # but the gunicorn path (the "backend" compose service) needs it or the
    # admin would render completely unstyled. entrypoint.sh runs
    # `collectstatic` on every boot.
    "whitenoise.middleware.WhiteNoiseMiddleware",
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
        # Project-level templates take priority over app-provided ones —
        # this is how templates/admin/index.html (the custom dashboard,
        # see profiles/dashboard.py) overrides unfold's own admin index.
        "DIRS": [BASE_DIR / "templates"],
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

STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    # Compressed + hashed filenames, served straight from gunicorn via
    # WhiteNoiseMiddleware above — no separate nginx/static host needed.
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}

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
# request, not part of the original docs/PRD-misura.md spec. Talks to an
# Ollama instance the user already runs on their own machine (not a
# container this project manages) — see docker-compose.yml for how the
# Dockerized backend reaches it via host.docker.internal. This bare
# 127.0.0.1 default is for running the backend directly with `manage.py
# runserver` (no Docker in between).
OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "gemma4:latest")
OLLAMA_TIMEOUT_SECONDS = float(os.environ.get("OLLAMA_TIMEOUT_SECONDS", "60"))

# --- Admin (django-unfold) -----------------------------------------------
# The index page (templates/admin/index.html) is a custom dashboard built
# from profiles/dashboard.dashboard_callback's stats — see that module for
# what it computes.
UNFOLD = {
    "SITE_TITLE": "MISURA",
    "SITE_HEADER": "MISURA",
    "SITE_SUBHEADER": "Il Sarto LiDAR — pannello operativo",
    "SITE_SYMBOL": "straighten",  # Material Symbols: a ruler — fits a fit/measurement app
    "SHOW_HISTORY": True,
    "SHOW_VIEW_ON_SITE": False,
    "BORDER_RADIUS": "10px",
    "COLORS": {
        "primary": {
            "50": "oklch(97.7% .013 236.62)",
            "100": "oklch(95.1% .026 236.824)",
            "200": "oklch(90.1% .058 230.902)",
            "300": "oklch(82.8% .111 230.318)",
            "400": "oklch(74.6% .16 232.661)",
            "500": "oklch(68.5% .169 237.323)",
            "600": "oklch(58.8% .158 241.966)",
            "700": "oklch(50% .134 242.749)",
            "800": "oklch(42.4% .1 240.756)",
            "900": "oklch(37.9% .146 265.522)",
            "950": "oklch(28.2% .091 267.935)",
        },
    },
    "SIDEBAR": {
        "show_search": True,
        "navigation": [
            {
                "title": "MISURA",
                "separator": True,
                "items": [
                    {
                        "title": "Dashboard",
                        "icon": "dashboard",
                        "link": "/admin/",
                    },
                    {
                        "title": "Profili",
                        "icon": "group",
                        "link": "/admin/profiles/profile/",
                    },
                ],
            },
        ],
    },
    "DASHBOARD_CALLBACK": "profiles.dashboard.dashboard_callback",
}
