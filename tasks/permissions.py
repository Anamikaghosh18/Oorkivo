from rest_framework import permissions
from organizations.models import OrganizationMembership
from projects.models import ProjectMembership

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

        # 1. Check organization membership and get role
        try:
            org_member = OrganizationMembership.objects.get(user=user, organization=org, is_active=True)
        except OrganizationMembership.DoesNotExist:
            return False # Completely blocked if not in org
            
        is_org_admin = org_member.access_level in [
            OrganizationMembership.AccessLevel.OWNER, 
            OrganizationMembership.AccessLevel.ADMIN
        ]
        
        # 2. Check project specific management role
        is_project_manager = ProjectMembership.objects.filter(
            user=user, 
            project=project, 
            role=ProjectMembership.ProjectRole.MANAGER
        ).exists()
        
        has_management_rights = is_org_admin or is_project_manager

        # --- PERMISSION RULES ---
        
        if view.action in ['retrieve']:
            if has_management_rights:
                return True
            if obj.assigned_to == user:
                return True
            # Check if user is in project or team
            in_project = ProjectMembership.objects.filter(user=user, project=project).exists()
            if in_project:
                return True
            if project.team and project.team.memberships.filter(user=user, is_active=True).exists():
                return True
            return False

        elif view.action in ['update', 'partial_update']:
            if has_management_rights:
                return True
            
           
            if obj.assigned_to == user:
                return True
                
            return False

        elif view.action in ['destroy']:
            return has_management_rights
            
        return False
