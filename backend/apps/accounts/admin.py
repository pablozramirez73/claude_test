from django.contrib import admin

from .models import Company, TelegramUser


@admin.register(Company)
class CompanyAdmin(admin.ModelAdmin):
    list_display = ["name", "vat", "plan", "telegram_chat_id", "created_at"]
    list_filter = ["plan"]
    search_fields = ["name", "vat", "custom_domain"]


@admin.register(TelegramUser)
class TelegramUserAdmin(admin.ModelAdmin):
    list_display = ["telegram_id", "username", "get_full_name", "company", "role", "is_active"]
    list_filter = ["role", "is_active", "company"]
    search_fields = ["telegram_id", "username", "first_name", "last_name"]
    raw_id_fields = ["company"]
