from django.urls import path

from .views import CheckoutSessionView, StripeWebhookView, plans_view

urlpatterns = [
    path("billing/plans/", plans_view, name="billing-plans"),
    path("billing/checkout/", CheckoutSessionView.as_view(), name="billing-checkout"),
    path("billing/webhook/stripe/", StripeWebhookView.as_view(), name="billing-webhook"),
]
