from rest_framework import permissions


class IsCompanyMember(permissions.BasePermission):
    """L'utente deve appartenere a un'azienda e l'oggetto deve essere della sua."""

    message = "Registra o seleziona un'azienda prima di procedere."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.company_id)

    def has_object_permission(self, request, view, obj):
        company_id = getattr(obj, "company_id", None) or getattr(obj, "id", None)
        return company_id == request.user.company_id


class CanManageCompany(IsCompanyMember):
    message = "Operazione riservata al ruolo RSPP o amministratore."

    def has_permission(self, request, view):
        return super().has_permission(request, view) and request.user.can_manage_company()
