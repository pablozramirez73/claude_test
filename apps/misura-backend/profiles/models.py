import secrets
import string

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

_ID_ALPHABET = string.ascii_lowercase + string.digits


def generate_profile_id() -> str:
    """8-char random id, matching the client-side id the Mini App already
    generates in ResultsScreen.tsx (`randomProfileId`) — so a profile saved
    from the frontend's own id round-trips cleanly if it's later synced here.
    """
    return "".join(secrets.choice(_ID_ALPHABET) for _ in range(8))


class Profile(models.Model):
    """
    A saved MISURA fit profile — deliberately minimal and anonymized
    (docs/PRD-misura.md §10): three body measurements plus a salted hash of
    the Telegram user id (never the raw id), nothing else. No images, no
    video, no depth data — those never leave the client at all.
    """

    profile_id = models.CharField(primary_key=True, max_length=32, default=generate_profile_id, editable=False)
    telegram_user_hash = models.CharField(max_length=64, blank=True, null=True, db_index=True)

    # Plausible adult circumference range in cm — generous bounds, just
    # enough to reject obviously-garbage input.
    _cm_validators = [MinValueValidator(20.0), MaxValueValidator(300.0)]
    chest_cm = models.FloatField(validators=_cm_validators)
    waist_cm = models.FloatField(validators=_cm_validators)
    hips_cm = models.FloatField(validators=_cm_validators)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.profile_id
