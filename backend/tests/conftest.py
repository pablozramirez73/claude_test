"""Fixture condivise dalla suite."""
import pytest


@pytest.fixture
def company(db):
    from apps.accounts.models import Company

    return Company.objects.create(
        name="Logistica Alfa Srl", vat="IT01234567890", telegram_chat_id=-100123456,
        rspp_name="Ing. M. Rossi",
    )


@pytest.fixture
def user(db, company):
    from apps.accounts.models import TelegramUser

    return TelegramUser.objects.create_user(
        telegram_id=555001,
        username="rspp_test",
        first_name="Marco",
        company=company,
        role=TelegramUser.Role.RSPP,
    )


@pytest.fixture
def init_data(user):
    from tests.factories import build_init_data

    return build_init_data(user.telegram_id, username=user.username)


@pytest.fixture
def api(init_data):
    from rest_framework.test import APIClient

    client = APIClient()
    client.credentials(HTTP_X_TELEGRAM_INIT_DATA=init_data)
    return client
