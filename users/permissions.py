from rest_framework.permissions import BasePermission
from organizations.models import OrganizationMembership
from projects.models import ProjectMembership
from teams.models import TeamMembership

class IsOrganizationAdmin(BasePermission):
    def has_permission(self, request, view):
        organization_id = view.kwargs.get("organization_id")

        if not organization_id or not request.user.is_authenticated:
            return False

        return OrganizationMembership.objects.filter(
            user=request.user,
            organization_id=organization_id,
            access_level__in=[
                OrganizationMembership.AccessLevel.OWNER,
                OrganizationMembership.AccessLevel.ADMIN,
            ],
            is_active=True,
            status=OrganizationMembership.Status.ACTIVE,
        ).exists()


class IsOrganizationManager(BasePermission):
    def has_permission(self, request, view):
        organization_id = view.kwargs.get("organization_id")

        if not organization_id or not request.user.is_authenticated:
            return False

        membership = OrganizationMembership.objects.filter(
            user=request.user,
            organization_id=organization_id,
            is_active=True,
            status=OrganizationMembership.Status.ACTIVE,
        ).first()
        if not membership:
            return False
        if membership.access_level in {
            OrganizationMembership.AccessLevel.OWNER,
            OrganizationMembership.AccessLevel.ADMIN,
        }:
            return True
        return (
            ProjectMembership.objects.filter(
                user=request.user,
                project__organization_id=organization_id,
                role=ProjectMembership.ProjectRole.MANAGER,
            ).exists()
            or TeamMembership.objects.filter(
                user=request.user,
                team__organization_id=organization_id,
                role=TeamMembership.TeamRole.LEAD,
            ).exists()
        )


class IsOrganizationMember(BasePermission):
    def has_permission(self, request, view):
        organization_id = view.kwargs.get("organization_id")

        if not organization_id or not request.user.is_authenticated:
            return False

        return OrganizationMembership.objects.filter(
            user=request.user,
            organization_id=organization_id,
            is_active=True,
            status=OrganizationMembership.Status.ACTIVE,
        ).exists()