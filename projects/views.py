from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db import models
from django.core.exceptions import ValidationError
from django.db import IntegrityError
from .models import Project, ProjectMembership, ProjectMilestone, Sprint
from .serializers import ProjectMilestoneSerializer, ProjectSerializer, ProjectMembershipSerializer, SprintSerializer
from organizations.models import OrganizationMembership
from teams.models import TeamMembership
from communication.models import Activity
from communication.serializers import ActivitySerializer

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
                    membership = serializer.save(project=project)
                    Activity.objects.create(
                        project=project,
                        actor=request.user,
                        action=Activity.ActionTypes.MEMBER_ADDED,
                        details={'member_id': membership.user_id},
                    )
                    return Response(serializer.data, status=status.HTTP_201_CREATED)
                except Exception as e:
                    return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['get', 'post'])
    def milestones(self, request, pk=None):
        project = self.get_object()
        if request.method == 'GET':
            milestones = ProjectMilestone.objects.filter(project=project).prefetch_related('tasks')
            return Response(ProjectMilestoneSerializer(milestones, many=True).data)

        if not self.has_milestone_permission(project):
            return Response({'detail': 'Only project contributors or managers can manage milestones.'}, status=status.HTTP_403_FORBIDDEN)
        serializer = ProjectMilestoneSerializer(data=request.data, context={'project': project})
        if serializer.is_valid():
            milestone = serializer.save(project=project)
            return Response(ProjectMilestoneSerializer(milestone).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['patch', 'delete'], url_path=r'milestones/(?P<milestone_id>\d+)')
    def milestone_detail(self, request, pk=None, milestone_id=None):
        project = self.get_object()
        if not self.has_milestone_permission(project):
            return Response({'detail': 'Only project contributors or managers can manage milestones.'}, status=status.HTTP_403_FORBIDDEN)
        milestone = ProjectMilestone.objects.filter(project=project, id=milestone_id).first()
        if milestone is None:
            return Response({'detail': 'Milestone not found.'}, status=status.HTTP_404_NOT_FOUND)
        if request.method == 'DELETE':
            milestone.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        serializer = ProjectMilestoneSerializer(
            milestone, data=request.data, partial=True, context={'project': project}
        )
        if serializer.is_valid():
            milestone = serializer.save()
            return Response(ProjectMilestoneSerializer(milestone).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def has_milestone_permission(self, project):
        return self.check_admin_permission(project) or ProjectMembership.objects.filter(
            user=self.request.user,
            project=project,
            role__in=[ProjectMembership.ProjectRole.MANAGER, ProjectMembership.ProjectRole.CONTRIBUTOR],
        ).exists()

    @action(detail=True, methods=['get'])
    def activity(self, request, pk=None):
        project = self.get_object()
        activities = Activity.objects.filter(project=project).select_related('actor', 'task')
        return Response(ActivitySerializer(activities[:100], many=True).data)

    @action(detail=True, methods=['get', 'post'])
    def sprints(self, request, pk=None):
        project = self.get_object()
        if request.method == 'GET':
            rows = Sprint.objects.filter(project=project).select_related('created_by')
            return Response(SprintSerializer(rows, many=True).data)
        if not self.has_management_permission(project):
            return Response({'detail': 'Only project managers can create sprints.'}, status=status.HTTP_403_FORBIDDEN)
        serializer = SprintSerializer(data=request.data)
        if serializer.is_valid():
            sprint = serializer.save(project=project, created_by=request.user)
            Activity.objects.create(
                project=project, actor=request.user, action=Activity.ActionTypes.SPRINT_CREATED,
                details={'sprint_id': sprint.id, 'sprint_name': sprint.name},
            )
            return Response(SprintSerializer(sprint).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(
        detail=True, methods=['get', 'patch', 'delete'],
        url_path=r'sprints/(?P<sprint_id>\d+)',
    )
    def sprint_detail(self, request, pk=None, sprint_id=None):
        project = self.get_object()
        sprint = Sprint.objects.filter(project=project, id=sprint_id).select_related('created_by').first()
        if sprint is None:
            return Response({'detail': 'Sprint not found.'}, status=status.HTTP_404_NOT_FOUND)
        if request.method == 'GET':
            return Response(SprintSerializer(sprint).data)
        if not self.has_management_permission(project):
            return Response({'detail': 'Only project managers can edit or delete sprints.'}, status=status.HTTP_403_FORBIDDEN)
        if request.method == 'DELETE':
            sprint.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        serializer = SprintSerializer(sprint, data=request.data, partial=True)
        if serializer.is_valid():
            try:
                return Response(SprintSerializer(serializer.save()).data)
            except (ValidationError, IntegrityError) as error:
                detail = error.message_dict if isinstance(error, ValidationError) else 'A project can only have one active sprint.'
                return Response({'detail': detail}, status=status.HTTP_400_BAD_REQUEST)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(
        detail=True, methods=['post'],
        url_path=r'sprints/(?P<sprint_id>\d+)/start',
    )
    def start_sprint(self, request, pk=None, sprint_id=None):
        return self._change_sprint_status(request, pk, sprint_id, Sprint.Status.ACTIVE)

    @action(
        detail=True, methods=['post'],
        url_path=r'sprints/(?P<sprint_id>\d+)/complete',
    )
    def complete_sprint(self, request, pk=None, sprint_id=None):
        return self._change_sprint_status(request, pk, sprint_id, Sprint.Status.COMPLETED)

    def _change_sprint_status(self, request, project_id, sprint_id, new_status):
        project = self.get_object()
        if not self.has_management_permission(project):
            return Response({'detail': 'Only project managers can change sprint status.'}, status=status.HTTP_403_FORBIDDEN)
        sprint = Sprint.objects.filter(project=project, id=sprint_id).first()
        if sprint is None:
            return Response({'detail': 'Sprint not found.'}, status=status.HTTP_404_NOT_FOUND)
        if new_status == Sprint.Status.ACTIVE and sprint.status != Sprint.Status.PLANNED:
            return Response({'detail': 'Only planned sprints can be started.'}, status=status.HTTP_400_BAD_REQUEST)
        if new_status == Sprint.Status.COMPLETED and sprint.status != Sprint.Status.ACTIVE:
            return Response({'detail': 'Only active sprints can be completed.'}, status=status.HTTP_400_BAD_REQUEST)
        sprint.status = new_status
        try:
            sprint.save()
        except (ValidationError, IntegrityError) as error:
            detail = error.message_dict if isinstance(error, ValidationError) else 'A project can only have one active sprint.'
            return Response({'detail': detail}, status=status.HTTP_400_BAD_REQUEST)
        action_type = Activity.ActionTypes.SPRINT_STARTED if new_status == Sprint.Status.ACTIVE else Activity.ActionTypes.SPRINT_COMPLETED
        Activity.objects.create(
            project=project, actor=request.user, action=action_type,
            details={'sprint_id': sprint.id, 'sprint_name': sprint.name},
        )
        return Response(SprintSerializer(sprint).data)
