from rest_framework import permissions
from .models import OrganizationMembership
from teams.models import TeamMembership


def membership_permissions(membership):
    user = membership.user
    organization = membership.organization
    is_owner = (
        organization.owner_id == user.id
        or membership.access_level == OrganizationMembership.AccessLevel.OWNER
    )
    can_manage_members = (
        is_owner or membership.access_level == OrganizationMembership.AccessLevel.ADMIN
    )
    can_manage_teams = can_manage_members or TeamMembership.objects.filter(
        user=user,
        team__organization=organization,
        role=TeamMembership.TeamRole.LEAD,
    ).exists()
    return {
        'can_manage_organization': is_owner,
        'can_manage_members': can_manage_members,
        'can_manage_teams': can_manage_teams,
        'can_manage_roles': False,
    }

class IsOrganizationOwner(permissions.BasePermission):
    """Requires the user to be the OWNER of the organization."""
    def has_object_permission(self, request, view, obj):
        if not request.user.is_authenticated:
            return False
        return obj.owner_id == request.user.id or OrganizationMembership.objects.filter(
            user=request.user, 
            organization=obj, 
            is_active=True,
            status=OrganizationMembership.Status.ACTIVE,
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
            ],
            is_active=True,
            status=OrganizationMembership.Status.ACTIVE,
        ).exists()

class IsOrganizationMember(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        if not request.user.is_authenticated:
            return False
        return OrganizationMembership.objects.filter(
            user=request.user, 
            organization=obj, 
            is_active=True,
            status=OrganizationMembership.Status.ACTIVE,
        ).exists()
