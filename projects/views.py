from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db import models
from .models import Project, ProjectMembership
from .serializers import ProjectSerializer, ProjectMembershipSerializer
from organizations.models import OrganizationMembership
from teams.models import TeamMembership

class ProjectViewSet(viewsets.ModelViewSet):
    serializer_class = ProjectSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        # User can see projects if:
        # 1. They are explicitly a member of the project
        # 2. They are a member of the team assigned to the project
        # 3. They are an ADMIN/OWNER of the organization
        user = self.request.user
        
        # All projects in orgs where user is ADMIN or OWNER
        admin_org_ids = OrganizationMembership.objects.filter(
            user=user, 
            access_level__in=[OrganizationMembership.AccessLevel.OWNER, OrganizationMembership.AccessLevel.ADMIN],
            is_active=True
        ).values_list('organization_id', flat=True)

        return Project.objects.filter(
            models.Q(organization_id__in=admin_org_ids) |
            models.Q(memberships__user=user) |
            models.Q(team__memberships__user=user)
        ).distinct()

    def check_admin_permission(self, project):
        return OrganizationMembership.objects.filter(
            user=self.request.user,
            organization=project.organization,
            access_level__in=[OrganizationMembership.AccessLevel.OWNER, OrganizationMembership.AccessLevel.ADMIN],
            is_active=True
        ).exists()

    def check_project_manager_permission(self, project):
        return ProjectMembership.objects.filter(
            user=self.request.user,
            project=project,
            role=ProjectMembership.ProjectRole.MANAGER
        ).exists()

    def has_management_permission(self, project):
        return self.check_admin_permission(project) or self.check_project_manager_permission(project)

    def update(self, request, *args, **kwargs):
        project = self.get_object()
        if not self.has_management_permission(project):
            return Response({'detail': 'Not permitted.'}, status=status.HTTP_403_FORBIDDEN)
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        project = self.get_object()
        if not self.check_admin_permission(project):
            return Response({'detail': 'Not permitted.'}, status=status.HTTP_403_FORBIDDEN)
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['get', 'post'])
    def members(self, request, pk=None):
        project = self.get_object()
        
        if request.method == 'GET':
            members = ProjectMembership.objects.filter(project=project)
            serializer = ProjectMembershipSerializer(members, many=True)
            return Response(serializer.data)
            
        elif request.method == 'POST':
            if not self.has_management_permission(project):
                return Response({'detail': 'Not permitted.'}, status=status.HTTP_403_FORBIDDEN)
                
            serializer = ProjectMembershipSerializer(data=request.data)
            if serializer.is_valid():
                try:
                    serializer.save(project=project)
                    return Response(serializer.data, status=status.HTTP_201_CREATED)
                except Exception as e:
                    return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

