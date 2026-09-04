"""Abbonamenti Stripe collegati alle aziende."""
from django.db import models
from django.utils import timezone


class Subscription(models.Model):
    class Status(models.TextChoices):
        TRIALING = "trialing", "In prova"
        ACTIVE = "active", "Attivo"
        PAST_DUE = "past_due", "Insoluto"
        CANCELED = "canceled", "Annullato"
        INCOMPLETE = "incomplete", "Incompleto"

    company = models.OneToOneField(
        "accounts.Company", on_delete=models.CASCADE, related_name="subscription"
    )
    plan = models.CharField(max_length=10, default="FREE")
    stripe_customer_id = models.CharField(max_length=64, blank=True, db_index=True)
    stripe_subscription_id = models.CharField(max_length=64, blank=True, db_index=True)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.INCOMPLETE)
    current_period_end = models.DateTimeField(null=True, blank=True)
    cancel_at_period_end = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "abbonamento"
        verbose_name_plural = "abbonamenti"

    def __str__(self):
        return f"{self.company} - {self.plan} ({self.status})"

    @property
    def is_active(self):
        if self.status not in {self.Status.ACTIVE, self.Status.TRIALING}:
            return False
        return self.current_period_end is None or self.current_period_end > timezone.now()


class WebhookEvent(models.Model):
    """Idempotenza sui webhook Stripe: un evento non viene applicato due volte."""

    stripe_event_id = models.CharField(max_length=64, unique=True)
    type = models.CharField(max_length=80)
    payload = models.JSONField(default=dict)
    processed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "evento webhook"
        verbose_name_plural = "eventi webhook"

    def __str__(self):
        return f"{self.type} ({self.stripe_event_id})"
