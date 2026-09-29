from rest_framework import permissions
from .models import OrganizationMembership

class IsOrganizationOwner(permissions.BasePermission):
    """Requires the user to be the OWNER of the organization."""
    def has_object_permission(self, request, view, obj):
        if not request.user.is_authenticated:
            return False
        return OrganizationMembership.objects.filter(
            user=request.user, 
            organization=obj, 
            access_level=OrganizationMembership.AccessLevel.OWNER
        ).exists()

class IsOrganizationAdminOrOwner(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        if not request.user.is_authenticated:
            return False
        return OrganizationMembership.objects.filter(
            user=request.user, 
            organization=obj, 
            access_level__in=[
                OrganizationMembership.AccessLevel.OWNER,
                OrganizationMembership.AccessLevel.ADMIN
            ]
        ).exists()

class IsOrganizationMember(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        if not request.user.is_authenticated:
            return False
        return OrganizationMembership.objects.filter(
            user=request.user, 
            organization=obj, 
            is_active=True
        ).exists()
