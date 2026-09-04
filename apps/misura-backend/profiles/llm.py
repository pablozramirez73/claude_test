"""
Local LLM integration (Ollama) — generates a short, friendly style/fit
advice text from a saved profile's measurements. Added on explicit user
request; not part of the original docs/PRD-misura.md spec.

Deliberately server-side and best-effort: the profile save/read/delete API
never depends on this working. Ollama can be slow (first call may need to
pull/load a multi-GB model) or simply not running — callers get a clear
error instead of a hang or a crash.
"""

import requests
from django.conf import settings

PROMPT_TEMPLATE = (
    "Sei un consulente di stile per un negozio di abbigliamento online. "
    "In base a queste misure corporee (petto {chest_cm} cm, vita {waist_cm} cm, "
    "fianchi {hips_cm} cm), scrivi 2-3 frasi amichevoli in italiano con un consiglio "
    "di vestibilità/stile generico e rispettoso. Non inventare taglie specifiche di "
    "un brand, non fare commenti sul corpo della persona, resta positivo e pratico."
)


class AdviceGenerationError(Exception):
    """Raised when Ollama is unreachable, times out, or returns something unusable."""


def generate_style_advice(chest_cm: float, waist_cm: float, hips_cm: float) -> str:
    prompt = PROMPT_TEMPLATE.format(chest_cm=chest_cm, waist_cm=waist_cm, hips_cm=hips_cm)

    try:
        response = requests.post(
            f"{settings.OLLAMA_BASE_URL}/api/generate",
            json={"model": settings.OLLAMA_MODEL, "prompt": prompt, "stream": False},
            timeout=settings.OLLAMA_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
    except requests.RequestException as exc:
        raise AdviceGenerationError(
            f"impossibile raggiungere Ollama ({settings.OLLAMA_BASE_URL}, "
            f"modello {settings.OLLAMA_MODEL}): {exc}"
        ) from exc

    data = response.json()
    text = data.get("response", "").strip()
    if not text:
        raise AdviceGenerationError("Ollama ha risposto senza testo utilizzabile")
    return text
