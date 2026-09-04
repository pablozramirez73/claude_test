from django.contrib import admin
from django.utils.html import format_html

from .models import Assessment, ReportDelivery


class ReportDeliveryInline(admin.TabularInline):
    model = ReportDelivery
    extra = 0
    readonly_fields = ["chat_id", "message_id", "ok", "error", "created_at"]
    can_delete = False


@admin.register(Assessment)
class AssessmentAdmin(admin.ModelAdmin):
    list_display = [
        "id", "company", "type", "worker_ref", "risk_badge",
        "lifting_index", "status", "created_at",
    ]
    list_filter = ["type", "risk_level", "status", "company"]
    search_fields = ["worker_ref", "workstation", "company__name"]
    readonly_fields = ["risk_score", "risk_level", "findings", "created_at", "updated_at"]
    raw_id_fields = ["company", "created_by"]
    inlines = [ReportDeliveryInline]
    date_hierarchy = "created_at"

    @admin.display(description="rischio", ordering="risk_score")
    def risk_badge(self, obj):
        colors = {"GREEN": "#16a34a", "YELLOW": "#ca8a04", "ORANGE": "#ea580c", "RED": "#dc2626"}
        return format_html(
            '<span style="color:{};font-weight:600">{} - {}</span>',
            colors.get(obj.risk_level, "#666"),
            f"{obj.risk_score:.0f}",
            obj.get_risk_level_display(),
        )
