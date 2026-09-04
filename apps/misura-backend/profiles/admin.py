from django.contrib import admin, messages
from unfold.admin import ModelAdmin
from unfold.contrib.filters.admin import RangeDateFilter, RangeNumericFilter
from unfold.decorators import display

from . import llm
from .models import Profile
from .sizing import recommend_size

_SIZE_BADGE_VARIANT = {
    "XS": "info",
    "S": "info",
    "M": "success",
    "L": "warning",
    "XL": "danger",
    "XXL": "danger",
}


@admin.register(Profile)
class ProfileAdmin(ModelAdmin):
    list_display = [
        "profile_id",
        "recommended_size_badge",
        "chest_cm",
        "waist_cm",
        "hips_cm",
        "advice_badge",
        "created_at",
    ]
    list_filter = [
        ("chest_cm", RangeNumericFilter),
        ("waist_cm", RangeNumericFilter),
        ("hips_cm", RangeNumericFilter),
        ("created_at", RangeDateFilter),
    ]
    search_fields = ["profile_id"]
    date_hierarchy = "created_at"
    ordering = ["-created_at"]
    list_per_page = 25

    # No raw telegram id ever reaches the admin either — only its hash
    # (profiles/hashing.py) — same anonymization guarantee as the API.
    readonly_fields = ["profile_id", "telegram_user_hash", "created_at", "style_advice"]
    fieldsets = (
        ("Misure", {"fields": ("profile_id", ("chest_cm", "waist_cm", "hips_cm"))}),
        ("Consiglio di stile (LLM locale)", {"fields": ("style_advice",)}),
        ("Anonimizzazione & metadata", {"fields": ("telegram_user_hash", "created_at")}),
    )

    actions = ["generate_style_advice_action"]

    @display(description="Taglia consigliata", label=_SIZE_BADGE_VARIANT)
    def recommended_size_badge(self, obj: Profile) -> str:
        return recommend_size(obj.chest_cm, obj.waist_cm, obj.hips_cm)

    @display(description="Consiglio generato", boolean=True)
    def advice_badge(self, obj: Profile) -> bool:
        return bool(obj.style_advice)

    @admin.action(description="Genera consiglio di stile (LLM locale) per i profili selezionati")
    def generate_style_advice_action(self, request, queryset):
        generated = 0
        failed = 0
        for profile in queryset:
            try:
                profile.style_advice = llm.generate_style_advice(
                    profile.chest_cm, profile.waist_cm, profile.hips_cm
                )
                profile.save(update_fields=["style_advice"])
                generated += 1
            except llm.AdviceGenerationError:
                failed += 1

        if generated:
            self.message_user(request, f"Consiglio di stile generato per {generated} profili.", messages.SUCCESS)
        if failed:
            self.message_user(
                request,
                f"Generazione fallita per {failed} profili (Ollama locale non raggiungibile?).",
                messages.WARNING,
            )
