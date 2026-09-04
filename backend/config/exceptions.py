"""Handler DRF che normalizza gli errori in un formato unico per la TMA."""
import logging

from rest_framework.views import exception_handler

logger = logging.getLogger(__name__)


def api_exception_handler(exc, context):
    response = exception_handler(exc, context)
    if response is None:
        logger.exception("Errore non gestito in %s", context.get("view"))
        return None

    detail = response.data
    if isinstance(detail, dict) and "detail" in detail:
        message = str(detail["detail"])
        fields = {}
    elif isinstance(detail, dict):
        message = "Dati non validi"
        fields = detail
    else:
        message = str(detail)
        fields = {}

    response.data = {
        "error": {
            "message": message,
            "fields": fields,
            "status": response.status_code,
        }
    }
    return response
