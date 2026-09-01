"""Valutazioni ergonomiche e relativi report."""
from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


class RiskLevel(models.TextChoices):
    ACCEPTABLE = "GREEN", "Accettabile"
    ATTENTION = "YELLOW", "Attenzione"
    HIGH = "ORANGE", "Rischio elevato"
    CRITICAL = "RED", "Rischio inaccettabile"


class Assessment(models.Model):
    """
    Una singola valutazione: il telefono analizza la posa on-device e invia
    qui solo i valori aggregati (angoli medi/percentili, lux, dB, stabilita').
    Nessun frame video lascia il dispositivo.
    """

    class Type(models.TextChoices):
        LIFT = "LIFT", "Sollevamento"
        PC = "PC", "Videoterminale"
        HANDLING = "HANDLING", "Movimentazione"

    class Status(models.TextChoices):
        PENDING = "PENDING", "In attesa"
        PROCESSING = "PROCESSING", "Elaborazione report"
        READY = "READY", "Report pronto"
        FAILED = "FAILED", "Errore"

    company = models.ForeignKey(
        "accounts.Company", on_delete=models.CASCADE, related_name="assessments"
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="assessments",
    )

    type = models.CharField(max_length=10, choices=Type.choices)
    worker_ref = models.CharField(
        "riferimento lavoratore",
        max_length=64,
        blank=True,
        help_text="Codice pseudonimo (es. MAG-014). Non inserire dati identificativi.",
    )
    workstation = models.CharField("postazione", max_length=120, blank=True)

    # Dati grezzi aggregati prodotti da MediaPipe sul dispositivo.
    pose_data = models.JSONField(default=dict)
    # Parametri del compito dichiarati dall'operatore (peso, frequenza, ...).
    task_data = models.JSONField(default=dict, blank=True)

    risk_score = models.FloatField(
        validators=[MinValueValidator(0), MaxValueValidator(100)], default=0
    )
    risk_level = models.CharField(max_length=6, choices=RiskLevel.choices, default=RiskLevel.ACCEPTABLE)
    # Esito NIOSH (solo per type=LIFT)
    lifting_index = models.FloatField(null=True, blank=True)
    recommended_weight_limit = models.FloatField(null=True, blank=True)

    light_lux = models.FloatField(null=True, blank=True)
    noise_db = models.FloatField(null=True, blank=True)
    device_tilt_deg = models.FloatField(null=True, blank=True)

    findings = models.JSONField(default=list, blank=True)
    duration_s = models.FloatField(default=0)
    frames_analyzed = models.PositiveIntegerField(default=0)

    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    pdf_report = models.FileField(upload_to="reports/%Y/%m/", blank=True, null=True)
    report_error = models.TextField(blank=True)
    delivered_to_telegram_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "valutazione"
        verbose_name_plural = "valutazioni"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["company", "-created_at"]),
            models.Index(fields=["company", "type", "-created_at"]),
        ]

    def __str__(self):
        return f"{self.get_type_display()} #{self.pk} - {self.risk_score:.0f}/100"

    @property
    def is_compliant(self):
        """Conformita' di massima ai requisiti minimi ambientali e posturali."""
        return self.risk_level in {RiskLevel.ACCEPTABLE, RiskLevel.ATTENTION}

    @property
    def report_filename(self):
        return f"ergocheck_{self.type.lower()}_{self.pk}.pdf"


class ReportDelivery(models.Model):
    """Traccia dell'invio del report al gruppo Telegram dell'azienda."""

    assessment = models.ForeignKey(
        Assessment, on_delete=models.CASCADE, related_name="deliveries"
    )
    chat_id = models.BigIntegerField()
    message_id = models.BigIntegerField(null=True, blank=True)
    ok = models.BooleanField(default=False)
    error = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
