from rest_framework.permissions import BasePermission

from users.models import OrganizationMembership
from .models import TeamMembership


class IsOrganizationMember(BasePermission):

    def has_permission(self, request, view):

        if not request.user.is_authenticated:
            return False

        organization_id = view.kwargs.get("organization_id")

        return OrganizationMembership.objects.filter(
            user=request.user,
            organization_id=organization_id
        ).exists()


class CanManageTeam(BasePermission):

    def has_permission(self, request, view):

        if not request.user.is_authenticated:
            return False

        team_id = view.kwargs.get("team_id")

        try:
            membership = OrganizationMembership.objects.get(
                user=request.user,
                organization_id=view.kwargs.get("organization_id")
            )
        except OrganizationMembership.DoesNotExist:
            return False

        # Admin can manage everything
        if membership.role == "ADMIN":
            return True

        # Manager must belong to this team
        if membership.role == "MANAGER":
            return TeamMembership.objects.filter(
                team_id=team_id,
                user=request.user,
                role="MANAGER"
            ).exists()

        return False