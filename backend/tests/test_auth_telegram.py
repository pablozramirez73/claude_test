"""Verifica della firma initData della Mini App."""
import time
from datetime import timedelta

import pytest

from apps.accounts.auth_telegram import (
    LAST_SEEN_REFRESH,
    InitDataError,
    upsert_user_from_init_data,
    verify_init_data,
)
from tests.factories import build_init_data

TOKEN = "123456:TEST-TOKEN"


def test_valid_init_data_is_accepted():
    data = verify_init_data(build_init_data(999, username="mario"), TOKEN)
    assert data.telegram_id == 999
    assert data.user["username"] == "mario"


def test_tampered_payload_is_rejected():
    raw = build_init_data(999)
    tampered = raw.replace("999", "1000")
    with pytest.raises(InitDataError, match="Firma"):
        verify_init_data(tampered, TOKEN)


def test_wrong_bot_token_is_rejected():
    with pytest.raises(InitDataError, match="Firma"):
        verify_init_data(build_init_data(999), "999999:OTHER-TOKEN")


def test_missing_hash_is_rejected():
    with pytest.raises(InitDataError, match="hash"):
        verify_init_data("user=%7B%22id%22%3A1%7D&auth_date=1700000000", TOKEN)


def test_empty_init_data_is_rejected():
    with pytest.raises(InitDataError, match="mancante"):
        verify_init_data("", TOKEN)


def test_expired_init_data_is_rejected():
    old = build_init_data(999, auth_date=time.time() - 3600 * 48)
    with pytest.raises(InitDataError, match="scaduta"):
        verify_init_data(old, TOKEN, max_age=timedelta(hours=24))


@pytest.mark.django_db
def test_upsert_creates_then_updates_user():
    data = verify_init_data(build_init_data(4242, username="primo"), TOKEN)
    user = upsert_user_from_init_data(data)
    assert user.telegram_id == 4242
    assert user.username == "primo"

    data = verify_init_data(build_init_data(4242, username="secondo"), TOKEN)
    same_user = upsert_user_from_init_data(data)
    assert same_user.pk == user.pk
    assert same_user.username == "secondo"


@pytest.mark.django_db
def test_api_rejects_request_without_init_data(client):
    assert client.get("/api/v1/me/").status_code == 401


@pytest.mark.django_db
def test_api_accepts_signed_request(api, user):
    response = api.get("/api/v1/me/")
    assert response.status_code == 200
    assert response.json()["telegram_id"] == user.telegram_id
    assert response.json()["company"]["vat"] == "IT01234567890"


@pytest.mark.django_db
def test_cors_preflight_allows_the_init_data_header(client, settings):
    """
    La Mini App gira su un'origine diversa dall'API: se il preflight non
    dichiara l'header di initData, il browser blocca ogni chiamata.
    """
    settings.CORS_ALLOWED_ORIGINS = ["https://ergocheck.example.com"]
    response = client.options(
        "/api/v1/me/",
        HTTP_ORIGIN="https://ergocheck.example.com",
        HTTP_ACCESS_CONTROL_REQUEST_METHOD="GET",
        HTTP_ACCESS_CONTROL_REQUEST_HEADERS="x-telegram-init-data",
    )
    assert response.status_code == 200
    allowed = response.headers["access-control-allow-headers"].lower()
    assert "x-telegram-init-data" in allowed


@pytest.mark.django_db
def test_repeated_requests_do_not_write_on_every_call(django_assert_num_queries, user):
    """
    L'autenticazione sta sul percorso di ogni richiesta: se il profilo non
    cambia e last_seen_at e' fresco, non deve partire nessuna scrittura.
    """
    from django.utils import timezone

    raw = build_init_data(user.telegram_id, username=user.username, first_name=user.first_name)
    upsert_user_from_init_data(verify_init_data(raw, TOKEN))

    user.refresh_from_db()
    assert user.last_seen_at is not None

    # Seconda chiamata identica: una sola SELECT, nessun UPDATE.
    with django_assert_num_queries(1):
        upsert_user_from_init_data(verify_init_data(raw, TOKEN))

    # Un profilo cambiato viene invece salvato.
    renamed = build_init_data(user.telegram_id, username="nuovo_nick", first_name=user.first_name)
    refreshed = upsert_user_from_init_data(verify_init_data(renamed, TOKEN))
    assert refreshed.username == "nuovo_nick"

    # E last_seen_at si aggiorna quando e' piu' vecchio della soglia.
    stale = timezone.now() - LAST_SEEN_REFRESH * 2
    type(user).objects.filter(pk=user.pk).update(last_seen_at=stale)
    upsert_user_from_init_data(verify_init_data(renamed, TOKEN))
    user.refresh_from_db()
    assert user.last_seen_at > stale
