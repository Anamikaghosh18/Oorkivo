from rest_framework import permissions
from organizations.models import OrganizationMembership
from tasks.permissions import HasTaskAccess

class IsCommentAuthorOrModerator(permissions.BasePermission):
    """
    Object-level permission to allow authors to edit/delete their comments.
    Allows Org Admins/Owners to delete comments (moderate).
    """

    def has_object_permission(self, request, view, obj):
        if not request.user.is_authenticated:
            return False

        # SAFE_METHODS handled by view's get_queryset (only accessible tasks/projects comments are returned)
        if request.method in permissions.SAFE_METHODS:
            return True

        if obj.author == request.user:
            return True

        # Check moderation rights (DELETE only)
        if request.method == 'DELETE':
            project = obj.task.project if hasattr(obj, 'task') else obj.project
            return OrganizationMembership.objects.filter(
                user=request.user,
                organization=project.organization,
                access_level__in=[OrganizationMembership.AccessLevel.OWNER, OrganizationMembership.AccessLevel.ADMIN],
                is_active=True,
                status=OrganizationMembership.Status.ACTIVE,
            ).exists()

        return False
