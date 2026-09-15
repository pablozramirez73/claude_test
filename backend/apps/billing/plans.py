"""Piani commerciali e controllo delle quote mensili."""
from rest_framework.exceptions import APIException


class QuotaExceeded(APIException):
    """402: quota del piano esaurita. La TMA mostra il paywall."""

    status_code = 402
    default_detail = "Quota di valutazioni esaurita per questo mese."
    default_code = "quota_exceeded"


PLANS = {
    "FREE": {
        "label": "Freemium",
        "price_eur": 0,
        # Il piano gratuito ha un tetto complessivo, non mensile: 3 valutazioni.
        "quota": 3,
        "monthly": False,
        "features": ["3 valutazioni di prova", "Report PDF con watermark"],
    },
    "PRO": {
        "label": "Pro",
        "price_eur": 49,
        "quota": 50,
        "monthly": True,
        "features": [
            "50 valutazioni/mese",
            "Report PDF completo",
            "Dashboard trend rischio",
            "Invio automatico al gruppo Telegram",
        ],
    },
    "AGENCY": {
        "label": "Agency White-Label",
        "price_eur": 299,
        "quota": None,  # illimitato
        "monthly": True,
        "features": [
            "Valutazioni illimitate",
            "Logo e colori del consulente sul report",
            "Dominio personalizzato",
            "Multi-azienda",
        ],
    },
}


def quota_for_plan(plan: str):
    """Numero di valutazioni consentite; None se illimitate."""
    return PLANS.get(plan, PLANS["FREE"])["quota"]


def is_monthly(plan: str) -> bool:
    return PLANS.get(plan, PLANS["FREE"])["monthly"]


def check_quota(company):
    """Solleva QuotaExceeded se l'azienda ha esaurito il piano."""
    quota = quota_for_plan(company.plan)
    if quota is None:
        return

    if is_monthly(company.plan):
        used = company.assessments_this_month()
    else:
        used = company.assessments.count()

    if used >= quota:
        raise QuotaExceeded(
            f"Quota esaurita - piano {PLANS[company.plan]['label']}: "
            f"{used}/{quota} valutazioni utilizzate. Passa al piano Pro per continuare."
        )
