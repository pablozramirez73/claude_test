"""Task Celery: generazione PDF e consegna del report su Telegram."""
import logging

from celery import shared_task
from django.core.files.base import ContentFile
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=5,
    retry_kwargs={"max_retries": 3},
    acks_late=True,
)
def generate_report_pdf(self, assessment_id: int, send_to_telegram: bool = True):
    """
    Rende il PDF, lo salva su storage (S3 in produzione) e, se l'azienda ha
    un gruppo collegato, lo recapita in chat.
    """
    from .models import Assessment
    from .pdf_report import build_report

    assessment = (
        Assessment.objects.select_related("company").filter(pk=assessment_id).first()
    )
    if assessment is None:
        logger.warning("Valutazione %s inesistente, task ignorato", assessment_id)
        return {"status": "missing"}

    try:
        watermark = assessment.company.plan == "FREE"
        pdf_bytes = build_report(assessment, watermark=watermark)
        assessment.pdf_report.save(
            assessment.report_filename, ContentFile(pdf_bytes), save=False
        )
        assessment.status = Assessment.Status.READY
        assessment.report_error = ""
        assessment.save(update_fields=["pdf_report", "status", "report_error", "updated_at"])
    except Exception as exc:
        # L'ultimo tentativo lascia traccia dell'errore sulla valutazione.
        if self.request.retries >= self.max_retries:
            Assessment.objects.filter(pk=assessment_id).update(
                status=Assessment.Status.FAILED, report_error=str(exc)[:500]
            )
        logger.exception("Generazione PDF fallita per la valutazione %s", assessment_id)
        raise

    notify_assessment_ready.delay(assessment_id)

    if send_to_telegram and assessment.company.telegram_chat_id:
        deliver_report_to_telegram.delay(assessment_id)

    return {"status": "ready", "assessment_id": assessment_id}


@shared_task(
    bind=True, autoretry_for=(Exception,), retry_backoff=10, retry_kwargs={"max_retries": 5}
)
def deliver_report_to_telegram(self, assessment_id: int):
    """Invia il PDF al gruppo aziendale con un riepilogo dell'esito."""
    from apps.bot.client import TelegramError, send_document

    from .models import Assessment, ReportDelivery
    from .pdf_report import LEVEL_LABELS

    assessment = (
        Assessment.objects.select_related("company").filter(pk=assessment_id).first()
    )
    if assessment is None or not assessment.pdf_report:
        return {"status": "skipped"}

    chat_id = assessment.company.telegram_chat_id
    if not chat_id:
        return {"status": "no_chat"}

    emoji = {
        "GREEN": "\U0001F7E2",
        "YELLOW": "\U0001F7E1",
        "ORANGE": "\U0001F7E0",
        "RED": "\U0001F534",
    }
    top = (assessment.findings or [])[:3]
    bullet_list = (
        "\n".join(f"• {f.get('title', '')}" for f in top) or "• Nessuna criticità rilevata"
    )

    caption = (
        f"{emoji.get(assessment.risk_level, '')} "
        f"<b>{LEVEL_LABELS.get(assessment.risk_level, '')}</b> "
        f"— punteggio {assessment.risk_score:.0f}/100\n"
        f"<b>{assessment.get_type_display()}</b>"
        f"{f' · {assessment.workstation}' if assessment.workstation else ''}"
        f"{f' · {assessment.worker_ref}' if assessment.worker_ref else ''}\n"
    )
    if assessment.lifting_index is not None:
        caption += f"Indice di sollevamento IS: <b>{assessment.lifting_index}</b>\n"
    caption += f"\n{bullet_list}"

    assessment.pdf_report.open("rb")
    try:
        content = assessment.pdf_report.read()
    finally:
        assessment.pdf_report.close()

    try:
        result = send_document(chat_id, assessment.report_filename, content, caption)
    except TelegramError as exc:
        ReportDelivery.objects.create(
            assessment=assessment, chat_id=chat_id, ok=False, error=str(exc)[:500]
        )
        # Un chat_id sbagliato non si risolve riprovando.
        if "chat not found" in str(exc).lower() or "bot was kicked" in str(exc).lower():
            return {"status": "failed", "error": str(exc)}
        raise

    ReportDelivery.objects.create(
        assessment=assessment, chat_id=chat_id, message_id=result.get("message_id"), ok=True
    )
    assessment.delivered_to_telegram_at = timezone.now()
    assessment.save(update_fields=["delivered_to_telegram_at"])
    return {"status": "sent", "message_id": result.get("message_id")}


@shared_task
def notify_assessment_ready(assessment_id: int):
    """Spinge lo stato aggiornato sul canale WebSocket della TMA."""
    from asgiref.sync import async_to_sync
    from channels.layers import get_channel_layer

    from .models import Assessment

    assessment = Assessment.objects.filter(pk=assessment_id).first()
    if assessment is None:
        return

    layer = get_channel_layer()
    if layer is None:
        return

    async_to_sync(layer.group_send)(
        f"company_{assessment.company_id}",
        {
            "type": "assessment.update",
            "payload": {
                "id": assessment.pk,
                "status": assessment.status,
                "risk_score": assessment.risk_score,
                "risk_level": assessment.risk_level,
                "pdf_url": assessment.pdf_report.url if assessment.pdf_report else None,
            },
        },
    )


@shared_task
def purge_stale_reports(days: int = 730):
    """
    Manutenzione: i PDF più vecchi del periodo di conservazione vengono
    rimossi dallo storage, il record resta per la statistica.
    """
    from datetime import timedelta

    from .models import Assessment

    cutoff = timezone.now() - timedelta(days=days)
    purged = 0
    for assessment in Assessment.objects.filter(created_at__lt=cutoff).exclude(pdf_report=""):
        assessment.pdf_report.delete(save=False)
        assessment.save(update_fields=["pdf_report"])
        purged += 1
    return {"purged": purged}
