from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from . import llm
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


class ProfileAdviceView(APIView):
    """POST /api/profiles/<profile_id>/advice/ — generate (or return the
    already-cached) style/fit advice text for a profile, via a local Ollama
    model (profiles/llm.py). Best-effort: Ollama being slow/unreachable
    never affects the rest of the API, only this one endpoint.

    Pass ?regenerate=true to force a fresh generation instead of returning
    the cached value.
    """

    permission_classes = [AllowAny]

    def post(self, request, profile_id):
        try:
            profile = Profile.objects.get(profile_id=profile_id)
        except Profile.DoesNotExist:
            return Response({"detail": "profilo non trovato"}, status=status.HTTP_404_NOT_FOUND)

        regenerate = request.query_params.get("regenerate", "").lower() == "true"
        if profile.style_advice and not regenerate:
            return Response({"profile_id": profile.profile_id, "style_advice": profile.style_advice})

        try:
            advice = llm.generate_style_advice(profile.chest_cm, profile.waist_cm, profile.hips_cm)
        except llm.AdviceGenerationError as exc:
            return Response(
                {"detail": f"generazione consiglio non riuscita: {exc}"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        profile.style_advice = advice
        profile.save(update_fields=["style_advice"])
        return Response({"profile_id": profile.profile_id, "style_advice": advice})


@api_view(["GET"])
@permission_classes([AllowAny])
def health(request):
    return Response({"status": "ok"})
