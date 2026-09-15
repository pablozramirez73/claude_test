from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

from apps.assessments.views import health_check

urlpatterns = [
    path("admin/", admin.site.urls),
    path("healthz/", health_check, name="health"),
    path("api/v1/", include("apps.accounts.urls")),
    path("api/v1/", include("apps.assessments.urls")),
    path("api/v1/", include("apps.billing.urls")),
    path("api/v1/", include("apps.bot.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
