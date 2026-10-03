from rest_framework import viewsets, mixins, status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action
from django_filters.rest_framework import DjangoFilterBackend
from .models import Task
from .serializers import TaskSerializer
from .permissions import HasTaskAccess
from projects.models import Project
from organizations.models import OrganizationMembership

class TaskViewSet(mixins.RetrieveModelMixin,
                  mixins.UpdateModelMixin,
                  mixins.DestroyModelMixin,
                  viewsets.GenericViewSet):
    """
    Handles GET, PATCH, DELETE for individual tasks: /api/tasks/{task_id}/
    """
    serializer_class = TaskSerializer
    permission_classes = [IsAuthenticated, HasTaskAccess]

    def get_queryset(self):
       
        user = self.request.user
        org_ids = OrganizationMembership.objects.filter(
            user=user, is_active=True
        ).values_list('organization_id', flat=True)
        
        return Task.objects.filter(project__organization_id__in=org_ids).select_related(
            'created_by', 'assigned_to', 'project', 'project__organization'
        )
        
    def perform_update(self, serializer):
        serializer.instance._current_user = self.request.user
        serializer.save()

    def perform_destroy(self, instance):
        instance._current_user = self.request.user
        instance.delete()


from rest_framework.views import APIView
from django.shortcuts import get_object_or_404
from projects.models import ProjectMembership

class ProjectTasksAPIView(APIView):
    permission_classes = [IsAuthenticated]
    
    def check_project_access(self, user, project):
        # 1. check org admin
        org = project.organization
        is_org_admin = OrganizationMembership.objects.filter(
            user=user, 
            organization=org, 
            access_level__in=[OrganizationMembership.AccessLevel.OWNER, OrganizationMembership.AccessLevel.ADMIN],
            is_active=True
        ).exists()
        if is_org_admin:
            return True
            
        # 2. check project member
        if ProjectMembership.objects.filter(user=user, project=project).exists():
            return True
            
        # 3. check team member
        if project.team and project.team.memberships.filter(user=user, is_active=True).exists():
            return True
            
        return False
        
    def check_project_management(self, user, project):
        is_org_admin = OrganizationMembership.objects.filter(
            user=user, 
            organization=project.organization, 
            access_level__in=[OrganizationMembership.AccessLevel.OWNER, OrganizationMembership.AccessLevel.ADMIN],
            is_active=True
        ).exists()
        if is_org_admin:
            return True
        return ProjectMembership.objects.filter(
            user=user, 
            project=project, 
            role=ProjectMembership.ProjectRole.MANAGER
        ).exists()

    def get(self, request, project_id):
        project = get_object_or_404(Project, id=project_id)
        
        # Check if user has access to view project tasks
        if not self.check_project_access(request.user, project):
            return Response({'detail': 'Not permitted.'}, status=status.HTTP_403_FORBIDDEN)
            
        tasks = Task.objects.filter(project=project).select_related(
            'created_by', 'assigned_to', 'project'
        )
        
        # Apply manual filtering since this is an APIView
        status_param = request.query_params.get('status')
        priority_param = request.query_params.get('priority')
        assigned_to_param = request.query_params.get('assigned_to')
        
        if status_param:
            tasks = tasks.filter(status=status_param)
        if priority_param:
            tasks = tasks.filter(priority=priority_param)
        if assigned_to_param:
            tasks = tasks.filter(assigned_to_id=assigned_to_param)
            
        serializer = TaskSerializer(tasks, many=True)
        return Response(serializer.data)

    def post(self, request, project_id):
        project = get_object_or_404(Project, id=project_id)
        
        
        if not self.check_project_management(request.user, project):
            return Response({'detail': 'You do not have permission to create tasks in this project.'}, status=status.HTTP_403_FORBIDDEN)
            
        serializer = TaskSerializer(data=request.data)
        if serializer.is_valid():
            try:
                task = serializer.save(created_by=request.user, project=project)
                task._current_user = request.user
                task.save()
                return Response(serializer.data, status=status.HTTP_201_CREATED)
            except Exception as e:
                return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
