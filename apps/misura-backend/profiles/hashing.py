"""
Anonymization helper (docs/PRD-misura.md §10 — "salvataggio profili
anonimizzati"): the raw Telegram user id is never stored. Only a salted
SHA-256 hash of it is, so a profile row can't be reversed back to a
specific Telegram account without also knowing PROFILE_HASH_SALT.
"""

import hashlib
import os


def hash_telegram_user_id(raw_user_id: str) -> str:
    salt = os.environ.get("PROFILE_HASH_SALT", "misura-dev-salt-change-me")
    digest = hashlib.sha256(f"{salt}:{raw_user_id}".encode("utf-8"))
    return digest.hexdigest()
