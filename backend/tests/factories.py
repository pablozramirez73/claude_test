"""Helper per costruire initData firmata come farebbe Telegram."""
import hashlib
import hmac
import json
import time
from urllib.parse import urlencode


def build_init_data(telegram_id: int, *, username="tester", token="123456:TEST-TOKEN",
                    auth_date=None, first_name="Test") -> str:
    user = json.dumps(
        {"id": telegram_id, "username": username, "first_name": first_name, "language_code": "it"},
        separators=(",", ":"),
    )
    fields = {
        "auth_date": str(int(auth_date or time.time())),
        "query_id": "AAETest",
        "user": user,
    }
    data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(fields.items()))
    secret = hmac.new(b"WebAppData", token.encode(), hashlib.sha256).digest()
    fields["hash"] = hmac.new(secret, data_check_string.encode(), hashlib.sha256).hexdigest()
    return urlencode(fields)
