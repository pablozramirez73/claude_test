"""Utenti Telegram e aziende clienti."""
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.core.validators import RegexValidator
from django.db import models
from django.utils import timezone


class Company(models.Model):
    """Azienda cliente: destinataria dei report e titolare dell'abbonamento."""

    class Plan(models.TextChoices):
        FREE = "FREE", "Freemium"
        PRO = "PRO", "Pro"
        AGENCY = "AGENCY", "Agency White-Label"

    name = models.CharField("ragione sociale", max_length=200)
    vat = models.CharField(
        "partita IVA",
        max_length=20,
        unique=True,
        validators=[RegexValidator(r"^[A-Za-z0-9]{8,20}$", "Partita IVA non valida")],
    )
    telegram_chat_id = models.BigIntegerField(
        "chat ID gruppo aziendale",
        help_text="Gruppo Telegram in cui vengono recapitati i report PDF.",
        null=True,
        blank=True,
    )
    plan = models.CharField(max_length=10, choices=Plan.choices, default=Plan.FREE)

    # White-label (piano Agency)
    brand_name = models.CharField(max_length=120, blank=True)
    brand_logo = models.ImageField(upload_to="branding/", blank=True, null=True)
    brand_color = models.CharField(max_length=7, blank=True, default="#0B6BCB")
    custom_domain = models.CharField(max_length=255, blank=True)

    rspp_name = models.CharField(
        "RSPP di riferimento", max_length=200, blank=True,
        help_text="Nome riportato in calce al report per la firma.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "azienda"
        verbose_name_plural = "aziende"
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.vat})"

    @property
    def display_name(self):
        """Nome mostrato nei report: il brand del consulente ha la precedenza."""
        return self.brand_name or self.name

    def monthly_quota(self):
        from apps.billing.plans import quota_for_plan

        return quota_for_plan(self.plan)

    def assessments_this_month(self):
        start = timezone.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        return self.assessments.filter(created_at__gte=start).count()

    def quota_remaining(self):
        quota = self.monthly_quota()
        if quota is None:  # illimitato
            return None
        return max(quota - self.assessments_this_month(), 0)


class TelegramUserManager(BaseUserManager):
    def create_user(self, telegram_id, **extra):
        if not telegram_id:
            raise ValueError("telegram_id obbligatorio")
        user = self.model(telegram_id=telegram_id, **extra)
        user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_superuser(self, telegram_id, password=None, **extra):
        extra.setdefault("is_staff", True)
        extra.setdefault("is_superuser", True)
        extra.setdefault("is_active", True)
        user = self.model(telegram_id=telegram_id, **extra)
        # Il superuser accede all'admin con password, gli utenti TMA no.
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save(using=self._db)
        return user


class TelegramUser(AbstractBaseUser, PermissionsMixin):
    """Utente autenticato tramite initData della Telegram Mini App."""

    class Role(models.TextChoices):
        OPERATOR = "OPERATOR", "Operatore"
        RSPP = "RSPP", "RSPP / Consulente"
        ADMIN = "ADMIN", "Amministratore azienda"

    telegram_id = models.BigIntegerField(unique=True, db_index=True)
    username = models.CharField(max_length=64, blank=True)
    first_name = models.CharField(max_length=120, blank=True)
    last_name = models.CharField(max_length=120, blank=True)
    language_code = models.CharField(max_length=8, blank=True, default="it")
    photo_url = models.URLField(blank=True)
    is_premium = models.BooleanField(default=False)

    company = models.ForeignKey(
        Company, on_delete=models.SET_NULL, null=True, blank=True, related_name="members"
    )
    role = models.CharField(max_length=10, choices=Role.choices, default=Role.OPERATOR)

    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    date_joined = models.DateTimeField(auto_now_add=True)
    last_seen_at = models.DateTimeField(null=True, blank=True)

    objects = TelegramUserManager()

    USERNAME_FIELD = "telegram_id"
    REQUIRED_FIELDS = []

    class Meta:
        verbose_name = "utente Telegram"
        verbose_name_plural = "utenti Telegram"
        ordering = ["-date_joined"]

    def __str__(self):
        return self.username or f"tg:{self.telegram_id}"

    def get_full_name(self):
        return f"{self.first_name} {self.last_name}".strip() or str(self)

    def get_short_name(self):
        return self.first_name or str(self)

    def can_manage_company(self):
        return self.role in {self.Role.RSPP, self.Role.ADMIN}
