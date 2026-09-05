from rest_framework import serializers

from .hashing import hash_telegram_user_id
from .models import Profile


class ProfileSerializer(serializers.ModelSerializer):
    # Accepted on write, hashed immediately, never stored or echoed back raw.
    telegram_user_id = serializers.CharField(write_only=True, required=False, allow_blank=True)
    # Client (the Mini App) may supply its own already-generated id so the
    # server-side row matches the id already used in the t.me share link;
    # otherwise the server generates one.
    profile_id = serializers.CharField(required=False)

    class Meta:
        model = Profile
        fields = ["profile_id", "chest_cm", "waist_cm", "hips_cm", "created_at", "telegram_user_id", "style_advice"]
        read_only_fields = ["created_at", "style_advice"]

    def create(self, validated_data):
        raw_telegram_id = validated_data.pop("telegram_user_id", None)
        if raw_telegram_id:
            validated_data["telegram_user_hash"] = hash_telegram_user_id(raw_telegram_id)
        return Profile.objects.create(**validated_data)
