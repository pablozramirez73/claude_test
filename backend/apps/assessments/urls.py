from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    AssessmentViewSet,
    CompanyDashboardView,
    ReportGenerateView,
    ThresholdsView,
)

router = DefaultRouter()
router.register("assessments", AssessmentViewSet, basename="assessment")

urlpatterns = [
    path("companies/<int:pk>/dashboard/", CompanyDashboardView.as_view(), name="company-dashboard"),
    path("reports/generate/", ReportGenerateView.as_view(), name="report-generate"),
    path("thresholds/", ThresholdsView.as_view(), name="thresholds"),
    path("", include(router.urls)),
]
