"""
Handler del bot ErgoCheck (python-telegram-bot v21).

Il bot ha tre compiti:
  * /start - apre la Mini App con il pulsante WebApp
  * /collega - registra il gruppo corrente come destinatario dei report
  * /ultime - riepilogo delle ultime valutazioni dell'azienda

Puo' girare in polling (`python manage.py run_bot`) oppure via webhook
(endpoint in apps/bot/views.py).
"""
import logging

from asgiref.sync import sync_to_async
from django.conf import settings
from telegram import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    MenuButtonWebApp,
    Update,
    WebAppInfo,
)
from telegram.constants import ParseMode
from telegram.ext import Application, CommandHandler, ContextTypes

logger = logging.getLogger(__name__)


def _webapp_url() -> str:
    """URL https della Mini App (Telegram accetta solo https in WebAppInfo)."""
    return settings.TMA_URL


WELCOME = (
    "<b>ErgoCheck - l'RSPP in tasca</b>\n\n"
    "Inquadra il lavoratore per 15 secondi e ottieni punteggio NIOSH, "
    "verifica di illuminamento e rumore e report PDF pronto da allegare al DVR.\n\n"
    "Premi il pulsante qui sotto per iniziare."
)

HELP = (
    "<b>Comandi disponibili</b>\n"
    "/start - apre la Mini App\n"
    "/collega - registra questo gruppo per la consegna dei report\n"
    "/ultime - ultime 5 valutazioni dell'azienda\n"
    "/piani - listino e limiti dei piani"
)


def _webapp_keyboard():
    return InlineKeyboardMarkup(
        [[InlineKeyboardButton("Avvia valutazione", web_app=WebAppInfo(url=_webapp_url()))]]
    )


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.effective_message.reply_html(WELCOME, reply_markup=_webapp_keyboard())


async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.effective_message.reply_html(HELP)


@sync_to_async
def _link_chat(telegram_id: int, chat_id: int):
    from apps.accounts.models import TelegramUser

    user = TelegramUser.objects.select_related("company").filter(telegram_id=telegram_id).first()
    if user is None or user.company is None:
        return None
    if not user.can_manage_company():
        return False
    user.company.telegram_chat_id = chat_id
    user.company.save(update_fields=["telegram_chat_id"])
    return user.company


async def link_chat(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat = update.effective_chat
    user = update.effective_user
    company = await _link_chat(user.id, chat.id)

    if company is None:
        await update.effective_message.reply_html(
            "Non risulti associato a un'azienda: apri prima la Mini App con /start."
        )
        return
    if company is False:
        await update.effective_message.reply_html(
            "Solo il ruolo RSPP o amministratore puo' collegare il gruppo."
        )
        return

    await update.effective_message.reply_html(
        f"Gruppo collegato a <b>{company.display_name}</b>. "
        "I prossimi report PDF arriveranno qui."
    )


@sync_to_async
def _last_assessments(telegram_id: int, limit: int = 5):
    from apps.accounts.models import TelegramUser
    from apps.assessments.models import Assessment

    user = TelegramUser.objects.filter(telegram_id=telegram_id).first()
    if user is None or not user.company_id:
        return None
    return list(
        Assessment.objects.filter(company_id=user.company_id).order_by("-created_at")[:limit]
    )


async def last_assessments(update: Update, context: ContextTypes.DEFAULT_TYPE):
    rows = await _last_assessments(update.effective_user.id)
    if rows is None:
        await update.effective_message.reply_html("Nessuna azienda associata. Usa /start.")
        return
    if not rows:
        await update.effective_message.reply_html("Nessuna valutazione registrata finora.")
        return

    emoji = {"GREEN": "\U0001F7E2", "YELLOW": "\U0001F7E1", "ORANGE": "\U0001F7E0", "RED": "\U0001F534"}
    lines = [
        f"{emoji.get(a.risk_level, '')} <b>{a.risk_score:.0f}</b> · {a.get_type_display()} · "
        f"{a.created_at.strftime('%d/%m %H:%M')}"
        for a in rows
    ]
    await update.effective_message.reply_html("<b>Ultime valutazioni</b>\n" + "\n".join(lines))


async def plans(update: Update, context: ContextTypes.DEFAULT_TYPE):
    from apps.billing.plans import PLANS

    lines = []
    for code, data in PLANS.items():
        price = "gratis" if not data["price_eur"] else f"{data['price_eur']}&euro;/mese"
        quota = "illimitate" if data["quota"] is None else f"{data['quota']} valutazioni"
        lines.append(f"<b>{data['label']}</b> — {price} · {quota}")
    await update.effective_message.reply_html("<b>Piani ErgoCheck</b>\n" + "\n".join(lines))


async def post_init(application: Application):
    """Imposta il pulsante di menu che apre la Mini App."""
    try:
        await application.bot.set_chat_menu_button(
            menu_button=MenuButtonWebApp(text="ErgoCheck", web_app=WebAppInfo(url=_webapp_url()))
        )
    except Exception:
        logger.warning("Impossibile impostare il menu button della Mini App", exc_info=True)


def build_application() -> Application:
    application = (
        Application.builder()
        .token(settings.TELEGRAM_BOT_TOKEN)
        .post_init(post_init)
        .build()
    )
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("help", help_command))
    application.add_handler(CommandHandler("collega", link_chat))
    application.add_handler(CommandHandler("ultime", last_assessments))
    application.add_handler(CommandHandler("piani", plans))
    return application


__all__ = ["build_application", "ParseMode"]
