from django.urls import path

from . import views

urlpatterns = [
    path("health/", views.health, name="health"),
    path("profiles/", views.ProfileCreateView.as_view(), name="profile-create"),
    path("profiles/<str:profile_id>/", views.ProfileDetailView.as_view(), name="profile-detail"),
]
