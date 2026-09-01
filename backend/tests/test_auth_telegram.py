"""Verifica della firma initData della Mini App."""
import time
from datetime import timedelta

import pytest

from apps.accounts.auth_telegram import (
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
