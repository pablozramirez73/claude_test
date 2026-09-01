from django.contrib import admin

from .models import Profile


@admin.register(Profile)
class ProfileAdmin(admin.ModelAdmin):
    list_display = ["profile_id", "chest_cm", "waist_cm", "hips_cm", "created_at"]
    readonly_fields = ["profile_id", "telegram_user_hash", "created_at"]
