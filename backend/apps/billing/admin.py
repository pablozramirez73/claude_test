from django.contrib import admin

from .models import Subscription, WebhookEvent


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = ["company", "plan", "status", "current_period_end", "cancel_at_period_end"]
    list_filter = ["plan", "status"]
    search_fields = ["company__name", "stripe_customer_id", "stripe_subscription_id"]


@admin.register(WebhookEvent)
class WebhookEventAdmin(admin.ModelAdmin):
    list_display = ["stripe_event_id", "type", "processed_at", "created_at"]
    search_fields = ["stripe_event_id", "type"]
