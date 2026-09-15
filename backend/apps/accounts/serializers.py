from rest_framework import serializers

from .models import Company, TelegramUser


class CompanySerializer(serializers.ModelSerializer):
    display_name = serializers.CharField(read_only=True)
    quota_remaining = serializers.SerializerMethodField()
    monthly_quota = serializers.SerializerMethodField()

    class Meta:
        model = Company
        fields = [
            "id", "name", "display_name", "vat", "telegram_chat_id", "plan",
            "brand_name", "brand_color", "custom_domain", "rspp_name",
            "monthly_quota", "quota_remaining", "created_at",
        ]
        read_only_fields = ["plan", "created_at"]

    def get_quota_remaining(self, obj):
        return obj.quota_remaining()

    def get_monthly_quota(self, obj):
        return obj.monthly_quota()


class TelegramUserSerializer(serializers.ModelSerializer):
    company = CompanySerializer(read_only=True)
    full_name = serializers.CharField(source="get_full_name", read_only=True)

    class Meta:
        model = TelegramUser
        fields = [
            "id", "telegram_id", "username", "first_name", "last_name",
            "full_name", "photo_url", "language_code", "role", "company",
            "is_premium", "date_joined",
        ]
        read_only_fields = fields


class CompanyJoinSerializer(serializers.Serializer):
    """Aggancia l'utente corrente a un'azienda esistente o ne crea una nuova."""

    name = serializers.CharField(max_length=200)
    vat = serializers.CharField(max_length=20)
    telegram_chat_id = serializers.IntegerField(required=False, allow_null=True)
    rspp_name = serializers.CharField(max_length=200, required=False, allow_blank=True)

    def create(self, validated_data):
        user = self.context["request"].user
        company, created = Company.objects.get_or_create(
            vat=validated_data["vat"].upper(),
            defaults={
                "name": validated_data["name"],
                "telegram_chat_id": validated_data.get("telegram_chat_id"),
                "rspp_name": validated_data.get("rspp_name", ""),
            },
        )
        user.company = company
        if created:
            # Chi registra l'azienda ne diventa amministratore.
            user.role = TelegramUser.Role.ADMIN
        user.save(update_fields=["company", "role"])
        return company
