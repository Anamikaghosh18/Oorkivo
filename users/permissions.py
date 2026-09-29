from rest_framework.permissions import BasePermission
from .models import OrganizationMembership

class IsOrganizationAdmin(BasePermission):
    def has_permission(self, request, view):
        organization_id = view.kwargs.get("organization_id")

        if not organization_id or not request.user.is_authenticated:
            return False

        return OrganizationMembership.objects.filter(
            user=request.user,
            organization_id=organization_id,
            role=OrganizationMembership.Role.ADMIN
        ).exists()


class IsOrganizationManager(BasePermission):
    def has_permission(self, request, view):
        organization_id = view.kwargs.get("organization_id")

        if not organization_id or not request.user.is_authenticated:
            return False

        return OrganizationMembership.objects.filter(
            user=request.user,
            organization_id=organization_id,
            role__in=[
                OrganizationMembership.Role.ADMIN,
                OrganizationMembership.Role.MANAGER,
            ]
        ).exists()


class IsOrganizationMember(BasePermission):
    def has_permission(self, request, view):
        organization_id = view.kwargs.get("organization_id")

        if not organization_id or not request.user.is_authenticated:
            return False

        return OrganizationMembership.objects.filter(
            user=request.user,
            organization_id=organization_id
        ).exists()