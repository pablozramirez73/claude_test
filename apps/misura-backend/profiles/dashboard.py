"""
Stats for the admin dashboard (templates/admin/index.html), wired in via
UNFOLD["DASHBOARD_CALLBACK"] in config/settings.py. django-unfold calls
dashboard_callback(request, context) and renders whatever we add to
`context` into the admin index page.
"""

from datetime import timedelta
from typing import Any

import requests
from django.conf import settings
from django.db.models import Avg
from django.http import HttpRequest
from django.utils import timezone

from .models import Profile
from .sizing import GENERIC_CHART, recommend_size

_SIZE_ORDER = [size.label for size in GENERIC_CHART]


def _check_ollama() -> dict[str, Any]:
    """Quick, short-timeout reachability check — this renders on every
    admin page load, so it must never hang the dashboard waiting on a slow
    or absent Ollama."""
    try:
        response = requests.get(f"{settings.OLLAMA_BASE_URL}/api/tags", timeout=1.5)
        response.raise_for_status()
        models = [m.get("name", "") for m in response.json().get("models", [])]
        model_pulled = any(settings.OLLAMA_MODEL.split(":")[0] in name for name in models)
        return {"reachable": True, "model_pulled": model_pulled, "models_count": len(models)}
    except requests.RequestException:
        return {"reachable": False, "model_pulled": False, "models_count": 0}


def dashboard_callback(request: HttpRequest, context: dict[str, Any]) -> dict[str, Any]:
    now = timezone.now()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=today_start.weekday())

    profiles = Profile.objects.all()
    total = profiles.count()

    averages = profiles.aggregate(
        avg_chest=Avg("chest_cm"), avg_waist=Avg("waist_cm"), avg_hips=Avg("hips_cm")
    )

    # Small-scale by design: this is an admin dashboard for local/MVP use,
    # not a high-volume analytics view, so a Python-side pass over all rows
    # to bucket by recommended size is fine — no need for a heavier query.
    size_counts: dict[str, int] = dict.fromkeys(_SIZE_ORDER, 0)
    for profile in profiles.only("chest_cm", "waist_cm", "hips_cm"):
        size_counts[recommend_size(profile.chest_cm, profile.waist_cm, profile.hips_cm)] += 1
    max_size_count = max(size_counts.values(), default=0)

    size_distribution = [
        {
            "label": label,
            "count": count,
            "percent": round((count / max_size_count) * 100) if max_size_count else 0,
        }
        for label, count in size_counts.items()
    ]

    recent_profiles = [
        {
            "profile_id": profile.profile_id,
            "size": recommend_size(profile.chest_cm, profile.waist_cm, profile.hips_cm),
            "chest_cm": profile.chest_cm,
            "waist_cm": profile.waist_cm,
            "hips_cm": profile.hips_cm,
            "has_advice": bool(profile.style_advice),
            "created_at": profile.created_at,
        }
        for profile in profiles.order_by("-created_at")[:6]
    ]

    with_advice = profiles.exclude(style_advice__isnull=True).exclude(style_advice="").count()

    context.update(
        {
            "misura_total_profiles": total,
            "misura_profiles_today": profiles.filter(created_at__gte=today_start).count(),
            "misura_profiles_week": profiles.filter(created_at__gte=week_start).count(),
            "misura_with_advice": with_advice,
            "misura_advice_percent": round((with_advice / total) * 100) if total else 0,
            "misura_avg_chest": averages["avg_chest"],
            "misura_avg_waist": averages["avg_waist"],
            "misura_avg_hips": averages["avg_hips"],
            "misura_size_distribution": size_distribution,
            "misura_recent_profiles": recent_profiles,
            "misura_ollama": _check_ollama(),
            "misura_ollama_model": settings.OLLAMA_MODEL,
        }
    )
    return context
