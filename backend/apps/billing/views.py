"""Endpoint di billing: listino, checkout Stripe, webhook."""
import logging

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.assessments.permissions import CanManageCompany

from .models import Subscription, WebhookEvent
from .plans import PLANS

logger = logging.getLogger(__name__)

PRICE_BY_PLAN = {
    "PRO": "STRIPE_PRICE_PRO",
    "AGENCY": "STRIPE_PRICE_AGENCY",
}


@api_view(["GET"])
@permission_classes([AllowAny])
def plans_view(request):
    """Listino pubblico, usato dal paywall della Mini App."""
    return Response(
        [
            {"code": code, **{k: v for k, v in data.items() if k != "monthly"}}
            for code, data in PLANS.items()
        ]
    )


class CheckoutSessionView(APIView):
    """Crea una Stripe Checkout Session per l'upgrade del piano."""

    permission_classes = [CanManageCompany]

    def post(self, request):
        plan = str(request.data.get("plan", "")).upper()
        if plan not in PRICE_BY_PLAN:
            return Response(
                {"detail": "Piano non valido."}, status=status.HTTP_400_BAD_REQUEST
            )
        if not settings.STRIPE_SECRET_KEY:
            return Response(
                {"detail": "Pagamenti non configurati su questo ambiente."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        import stripe

        stripe.api_key = settings.STRIPE_SECRET_KEY
        company = request.user.company
        subscription, _ = Subscription.objects.get_or_create(company=company)

        if not subscription.stripe_customer_id:
            customer = stripe.Customer.create(
                name=company.name,
                metadata={"company_id": company.id, "vat": company.vat},
            )
            subscription.stripe_customer_id = customer["id"]
            subscription.save(update_fields=["stripe_customer_id"])

        session = stripe.checkout.Session.create(
            mode="subscription",
            customer=subscription.stripe_customer_id,
            line_items=[{"price": getattr(settings, PRICE_BY_PLAN[plan]), "quantity": 1}],
            success_url=request.data.get("success_url") or "https://t.me/",
            cancel_url=request.data.get("cancel_url") or "https://t.me/",
            metadata={"company_id": company.id, "plan": plan},
        )
        return Response({"checkout_url": session["url"], "session_id": session["id"]})


class StripeWebhookView(APIView):
    """Riceve gli eventi Stripe e allinea piano/stato dell'abbonamento."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        import stripe

        payload = request.body
        signature = request.META.get("HTTP_STRIPE_SIGNATURE", "")
        try:
            event = stripe.Webhook.construct_event(
                payload, signature, settings.STRIPE_WEBHOOK_SECRET
            )
        except Exception as exc:  # firma non valida o payload corrotto
            logger.warning("Webhook Stripe rifiutato: %s", exc)
            return Response({"detail": "invalid signature"}, status=status.HTTP_400_BAD_REQUEST)

        record, created = WebhookEvent.objects.get_or_create(
            stripe_event_id=event["id"],
            defaults={"type": event["type"], "payload": event.get("data", {})},
        )
        if not created and record.processed_at:
            return Response({"status": "duplicate"})

        self._apply(event)
        record.processed_at = timezone.now()
        record.save(update_fields=["processed_at"])
        return Response({"status": "ok"})

    @transaction.atomic
    def _apply(self, event):
        obj = event["data"]["object"]
        event_type = event["type"]

        if event_type == "checkout.session.completed":
            company_id = (obj.get("metadata") or {}).get("company_id")
            plan = (obj.get("metadata") or {}).get("plan", "PRO")
            subscription = Subscription.objects.select_related("company").filter(
                company_id=company_id
            ).first()
            if subscription:
                subscription.stripe_subscription_id = obj.get("subscription", "")
                subscription.plan = plan
                subscription.status = Subscription.Status.ACTIVE
                subscription.save()
                subscription.company.plan = plan
                subscription.company.save(update_fields=["plan"])

        elif event_type in {"customer.subscription.updated", "customer.subscription.deleted"}:
            subscription = Subscription.objects.select_related("company").filter(
                stripe_subscription_id=obj.get("id", "")
            ).first()
            if not subscription:
                return
            subscription.status = obj.get("status", Subscription.Status.CANCELED)
            subscription.cancel_at_period_end = bool(obj.get("cancel_at_period_end"))
            period_end = obj.get("current_period_end")
            if period_end:
                subscription.current_period_end = timezone.datetime.fromtimestamp(
                    period_end, tz=timezone.get_current_timezone()
                )
            subscription.save()
            if not subscription.is_active:
                subscription.company.plan = "FREE"
                subscription.company.save(update_fields=["plan"])
