"""API delle valutazioni ergonomiche."""
from datetime import timedelta

from django.db.models import Avg, Count, Q
from django.db.models.functions import TruncDate
from django.http import JsonResponse
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import Company

from .models import Assessment, RiskLevel
from .permissions import IsCompanyMember
from .serializers import (
    AssessmentListSerializer,
    AssessmentSerializer,
    ReportGenerateSerializer,
)
from .tasks import generate_report_pdf


def health_check(request):
    """Liveness probe per il load balancer."""
    return JsonResponse({"status": "ok", "service": "ergocheck"})


class AssessmentViewSet(
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.ListModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """
    POST /api/v1/assessments/   crea la valutazione dai dati on-device
    GET  /api/v1/assessments/   elenco filtrabile per tipo/livello
    """

    permission_classes = [IsCompanyMember]
    throttle_scope = "assessment_create"
    filterset_fields = ["type", "risk_level", "status", "workstation"]

    def get_queryset(self):
        return (
            Assessment.objects.filter(company_id=self.request.user.company_id)
            .select_related("created_by")
            .order_by("-created_at")
        )

    def get_serializer_class(self):
        if self.action == "list":
            return AssessmentListSerializer
        return AssessmentSerializer

    def perform_create(self, serializer):
        assessment = serializer.save()
        # Il PDF è pesante: si genera fuori dal ciclo richiesta/risposta.
        assessment.status = Assessment.Status.PROCESSING
        assessment.save(update_fields=["status"])
        generate_report_pdf.delay(assessment.pk, send_to_telegram=True)

    @action(detail=True, methods=["get"])
    def report(self, request, pk=None):
        """Stato del report e URL del PDF quando pronto."""
        assessment = self.get_object()
        serializer = self.get_serializer(assessment)
        return Response(
            {
                "status": assessment.status,
                "pdf_url": serializer.data.get("pdf_url"),
                "error": assessment.report_error,
            }
        )


class ReportGenerateView(APIView):
    """POST /api/v1/reports/generate/ - rigenera il PDF (task Celery)."""

    permission_classes = [IsCompanyMember]
    throttle_scope = "report_generate"

    def post(self, request):
        serializer = ReportGenerateSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        assessment_id = serializer.validated_data["assessment_id"]

        Assessment.objects.filter(pk=assessment_id).update(
            status=Assessment.Status.PROCESSING, report_error=""
        )
        task = generate_report_pdf.delay(
            assessment_id,
            send_to_telegram=serializer.validated_data["send_to_telegram"],
        )
        return Response(
            {"task_id": task.id, "assessment_id": assessment_id, "status": "PROCESSING"},
            status=status.HTTP_202_ACCEPTED,
        )


class CompanyDashboardView(APIView):
    """
    GET /api/v1/companies/{id}/dashboard/

    Trend del rischio, distribuzione per livello e rilievi più frequenti:
    è la vista che giustifica l'abbonamento (dato continuo, non spot).
    """

    permission_classes = [IsCompanyMember]

    def get(self, request, pk):
        if int(pk) != request.user.company_id:
            return Response(
                {"detail": "Azienda non accessibile."}, status=status.HTTP_403_FORBIDDEN
            )

        company = Company.objects.get(pk=pk)
        days = min(int(request.query_params.get("days", 90)), 365)
        since = timezone.now() - timedelta(days=days)
        qs = Assessment.objects.filter(company=company, created_at__gte=since)

        trend = list(
            qs.annotate(day=TruncDate("created_at"))
            .values("day")
            .annotate(avg_score=Avg("risk_score"), count=Count("id"))
            .order_by("day")
        )

        by_level = {
            level: qs.filter(risk_level=level).count() for level, _ in RiskLevel.choices
        }
        by_type = list(
            qs.values("type").annotate(count=Count("id"), avg_score=Avg("risk_score"))
        )

        # I rilievi vivono in JSON: si aggregano in Python, i volumi sono modesti.
        finding_counts: dict[str, dict] = {}
        for findings in qs.values_list("findings", flat=True):
            for finding in findings or []:
                entry = finding_counts.setdefault(
                    finding.get("code", "?"),
                    {
                        "code": finding.get("code", "?"),
                        "title": finding.get("title", ""),
                        "count": 0,
                    },
                )
                entry["count"] += 1
        top_findings = sorted(finding_counts.values(), key=lambda f: -f["count"])[:8]

        return Response(
            {
                "company": {
                    "id": company.id,
                    "name": company.display_name,
                    "plan": company.plan,
                    "quota_remaining": company.quota_remaining(),
                },
                "period_days": days,
                "total_assessments": qs.count(),
                "avg_risk_score": round(qs.aggregate(v=Avg("risk_score"))["v"] or 0, 1),
                "critical_count": qs.filter(
                    Q(risk_level=RiskLevel.CRITICAL) | Q(risk_level=RiskLevel.HIGH)
                ).count(),
                "trend": trend,
                "by_level": by_level,
                "by_type": by_type,
                "top_findings": top_findings,
            }
        )


class ThresholdsView(APIView):
    """Soglie normative servite alla TMA per il feedback in tempo reale."""

    permission_classes = [AllowAny]

    def get(self, request):
        from django.conf import settings

        from . import niosh_calculator as calc

        return Response(
            {
                "min_lux": settings.ERGO_MIN_LUX,
                "max_noise_db": settings.ERGO_MAX_NOISE_DB,
                "max_tilt_deg": settings.ERGO_MAX_TILT_DEG,
                "trunk_flexion_warn": calc.TRUNK_FLEXION_WARN,
                "trunk_twist_warn": calc.TRUNK_TWIST_WARN,
                "arm_elevation_warn": calc.ARM_ELEVATION_WARN,
                "neck_flexion_warn": calc.NECK_FLEXION_WARN,
                "ear_fatigue": calc.EAR_FATIGUE_THRESHOLD,
            }
        )
