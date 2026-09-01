from rest_framework import generics
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .models import Profile
from .serializers import ProfileSerializer


class ProfileCreateView(generics.CreateAPIView):
    """POST /api/profiles/ — save a fit profile (mirrors the Mini App's
    Telegram CloudStorage save, as a server-side option per docs/PRD-misura.md §7/§10)."""

    queryset = Profile.objects.all()
    serializer_class = ProfileSerializer
    permission_classes = [AllowAny]


class ProfileDetailView(generics.RetrieveDestroyAPIView):
    """GET /api/profiles/<profile_id>/ — fetch a profile.
    DELETE /api/profiles/<profile_id>/ — erase it (the GDPR "delete my profile" affordance, §10)."""

    queryset = Profile.objects.all()
    serializer_class = ProfileSerializer
    permission_classes = [AllowAny]
    lookup_field = "profile_id"


@api_view(["GET"])
@permission_classes([AllowAny])
def health(request):
    return Response({"status": "ok"})
