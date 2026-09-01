from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import GenericViewSet
from rest_framework.mixins import RetrieveModelMixin, UpdateModelMixin

from apps.assessments.permissions import IsCompanyMember

from .models import Company
from .serializers import CompanyJoinSerializer, CompanySerializer, TelegramUserSerializer


class MeView(APIView):
    """Profilo dell'utente autenticato via initData; usato all'avvio della TMA."""

    def get(self, request):
        return Response(TelegramUserSerializer(request.user).data)


class CompanyViewSet(RetrieveModelMixin, UpdateModelMixin, GenericViewSet):
    serializer_class = CompanySerializer
    permission_classes = [IsCompanyMember]

    def get_queryset(self):
        # Un utente vede solo la propria azienda, mai le altre.
        if self.request.user.company_id:
            return Company.objects.filter(pk=self.request.user.company_id)
        return Company.objects.none()

    @action(detail=False, methods=["post"], permission_classes=[])
    def join(self, request):
        serializer = CompanyJoinSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        company = serializer.save()
        return Response(CompanySerializer(company).data, status=status.HTTP_201_CREATED)
