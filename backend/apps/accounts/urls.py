from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import CompanyViewSet, MeView

router = DefaultRouter()
router.register("companies", CompanyViewSet, basename="company")

urlpatterns = [
    path("me/", MeView.as_view(), name="me"),
    path("", include(router.urls)),
]
