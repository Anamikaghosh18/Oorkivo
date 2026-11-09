from rest_framework import permissions
from organizations.models import OrganizationMembership
from projects.models import ProjectMembership
from organizations.context import current_organization_id

class HasTaskAccess(permissions.BasePermission):
    """
    Object-level permission to determine if a user can view or modify a specific task.
    """
    
    def has_object_permission(self, request, view, obj):
        user = request.user
        project = obj.project
        org = project.organization
        
        if not user.is_authenticated:
            return False
        selected_organization_id = current_organization_id(request)
        if selected_organization_id is not None and project.organization_id != selected_organization_id:
            return False

        # 1. Check organization membership and get role
        try:
            org_member = OrganizationMembership.objects.get(
                user=user,
                organization=org,
                is_active=True,
                status=OrganizationMembership.Status.ACTIVE,
            )
        except OrganizationMembership.DoesNotExist:
            return False # Completely blocked if not in org
            
        is_org_admin = org_member.access_level in [
            OrganizationMembership.AccessLevel.OWNER, 
            OrganizationMembership.AccessLevel.ADMIN
        ]
        
        has_management_rights = is_org_admin

        # --- PERMISSION RULES ---
        
        action = getattr(view, 'action', None)
        if action in ['retrieve', 'subtasks', 'activity', 'attachments', 'attachment_detail'] or action is None:
            if has_management_rights:
                return True
            if obj.assigned_to == user:
                return True
            # Check if user is in project or team
            in_project = ProjectMembership.objects.filter(user=user, project=project).exists()
            if in_project:
                return True
            if project.team and project.team.memberships.filter(user=user).exists():
                return True
            return False

        elif action in ['update', 'partial_update']:
            if has_management_rights:
                return True
            return obj.assigned_to == user

        elif action in ['destroy']:
            return has_management_rights
            
        return False
