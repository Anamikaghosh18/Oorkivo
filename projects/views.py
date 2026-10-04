from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import NotFound, PermissionDenied
from django.db import models
from django.core.exceptions import ValidationError
from django.db import IntegrityError
from .models import Project, ProjectMembership, ProjectMilestone, Sprint
from .serializers import ProjectMilestoneSerializer, ProjectSerializer, ProjectMembershipSerializer, SprintSerializer
from organizations.models import Organization, OrganizationMembership
from teams.models import TeamMembership
from organizations.context import active_organization_ids, current_organization_id
from communication.models import Activity, Notification
from communication.serializers import ActivitySerializer
from communication.services import create_notification, notify_project_members

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
            is_active=True,
            status=OrganizationMembership.Status.ACTIVE,
        ).values_list('organization_id', flat=True)

        queryset = Project.objects.filter(
            organization_id__in=active_organization_ids(user)
        ).filter(
            models.Q(organization_id__in=admin_org_ids) |
            models.Q(memberships__user=user) |
            models.Q(team__memberships__user=user)
        ).distinct()
        if self.action == 'restore':
            queryset = queryset.filter(is_archived=True)
        elif self.request.query_params.get('include_archived') != 'true':
            queryset = queryset.filter(is_archived=False)
        organization_id = current_organization_id(self.request)
        if organization_id is not None:
            queryset = queryset.filter(organization_id=organization_id)
        return queryset

    def check_admin_permission(self, project):
        organization = getattr(project, 'organization', project)
        return OrganizationMembership.objects.filter(
            user=self.request.user,
            organization=organization,
            access_level__in=[OrganizationMembership.AccessLevel.OWNER, OrganizationMembership.AccessLevel.ADMIN],
            is_active=True,
            status=OrganizationMembership.Status.ACTIVE,
        ).exists()

    def check_project_manager_permission(self, project):
        return ProjectMembership.objects.filter(
            user=self.request.user,
            project=project,
            role=ProjectMembership.ProjectRole.MANAGER
        ).exists()

    def has_management_permission(self, project):
        return self.check_admin_permission(project) or self.check_project_manager_permission(project)

    def perform_create(self, serializer):
        organization_id = current_organization_id(self.request) or self.request.data.get('organization')
        organization = Organization.objects.filter(
            pk=organization_id,
            id__in=active_organization_ids(self.request.user),
        ).first()
        if organization is None:
            raise PermissionDenied('Choose an organization you actively belong to.')
        selected_organization_id = current_organization_id(self.request)
        if selected_organization_id is not None and organization.id != selected_organization_id:
            raise PermissionDenied('Projects can only be created in the current organization.')
        if not self.check_admin_permission(organization):
            raise PermissionDenied('Only organization owners or admins can create projects.')
        serializer.save(organization=organization)

    def update(self, request, *args, **kwargs):
        project = self.get_object()
        if not self.has_management_permission(project):
            return Response({'detail': 'Not permitted.'}, status=status.HTTP_403_FORBIDDEN)
        return super().update(request, *args, **kwargs)

    def perform_update(self, serializer):
        project = serializer.instance
        previous = {
            'name': project.name,
            'description': project.description,
            'status': project.status,
            'team_id': project.team_id,
            'start_date': project.start_date,
            'target_end_date': project.target_end_date,
        }
        updated = serializer.save()
        changed = [key for key in previous if previous[key] != getattr(updated, key)]
        if changed:
            details = {'fields': changed}
            if (
                previous['status'] != Project.Status.COMPLETED
                and updated.status == Project.Status.COMPLETED
            ):
                details['celebration'] = 'PROJECT_COMPLETED'
            Activity.objects.create(
                project=updated,
                actor=self.request.user,
                action=Activity.ActionTypes.PROJECT_UPDATED,
                details=details,
            )
            notify_project_members(
                project=updated,
                actor=self.request.user,
                kind=Notification.NotificationTypes.PROJECT_UPDATED,
                title='Project updated',
                message=f'{updated.name} was updated.',
            )

    def destroy(self, request, *args, **kwargs):
        project = self.get_object()
        if not self.has_management_permission(project):
            return Response({'detail': 'Not permitted.'}, status=status.HTTP_403_FORBIDDEN)
        project.is_archived = True
        project.save(update_fields=['is_archived', 'updated_at'])
        Activity.objects.create(
            project=project,
            actor=request.user,
            action=Activity.ActionTypes.PROJECT_ARCHIVED,
            details={'project_name': project.name},
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated])
    def restore(self, request, pk=None):
        project = self.get_object()
        if not self.has_management_permission(project):
            return Response({'detail': 'Not permitted.'}, status=status.HTTP_403_FORBIDDEN)
        project.is_archived = False
        project.save(update_fields=['is_archived', 'updated_at'])
        Activity.objects.create(
            project=project,
            actor=request.user,
            action=Activity.ActionTypes.PROJECT_RESTORED,
            details={'project_name': project.name},
        )
        return Response(ProjectSerializer(project).data)

    @action(detail=True, methods=['get', 'post'])
    def members(self, request, pk=None):
        project = self.get_object()
        
        if request.method == 'GET':
            members = ProjectMembership.objects.filter(project=project)
            serializer = ProjectMembershipSerializer(
                members, many=True, context=self.get_serializer_context()
            )
            return Response(serializer.data)
            
        elif request.method == 'POST':
            if not self.has_management_permission(project):
                return Response({'detail': 'Not permitted.'}, status=status.HTTP_403_FORBIDDEN)
                
            serializer = ProjectMembershipSerializer(
                data=request.data,
                context={**self.get_serializer_context(), 'project': project},
            )
            if serializer.is_valid():
                try:
                    membership = serializer.save(project=project)
                    Activity.objects.create(
                        project=project,
                        actor=request.user,
                        action=Activity.ActionTypes.MEMBER_ADDED,
                        details={'member_id': membership.user_id, 'member_name': membership.user.get_full_name() or membership.user.email},
                    )
                    create_notification(
                        recipient=membership.user,
                        actor=request.user,
                        kind=Notification.NotificationTypes.PROJECT_UPDATED,
                        title='You were added to a project',
                        message=f'{request.user.get_full_name() or request.user.email} added you to {project.name}.',
                        project=project,
                    )
                    return Response(serializer.data, status=status.HTTP_201_CREATED)
                except (ValidationError, IntegrityError) as e:
                    return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(
        detail=True,
        methods=['delete'],
        url_path=r'members/(?P<membership_id>\d+)',
    )
    def member_detail(self, request, pk=None, membership_id=None):
        project = self.get_object()
        if not self.has_management_permission(project):
            return Response({'detail': 'Not permitted.'}, status=status.HTTP_403_FORBIDDEN)
        membership = ProjectMembership.objects.filter(
            project=project, id=membership_id
        ).select_related('user').first()
        if membership is None:
            raise NotFound('Project membership not found.')
        member_id = membership.user_id
        membership.delete()
        Activity.objects.create(
            project=project,
            actor=request.user,
            action=Activity.ActionTypes.MEMBER_REMOVED,
            details={'member_id': member_id},
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

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
            notify_project_members(
                project=project,
                actor=request.user,
                kind=Notification.NotificationTypes.MILESTONE_UPDATED,
                title='Milestone added',
                message=f'{milestone.title} was added to {project.name}.',
            )
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
            previous = {
                'title': milestone.title,
                'description': milestone.description,
                'target_date': milestone.target_date,
            }
            milestone = serializer.save()
            if any(previous[key] != getattr(milestone, key) for key in previous):
                notify_project_members(
                    project=project,
                    actor=request.user,
                    kind=Notification.NotificationTypes.MILESTONE_UPDATED,
                    title='Milestone updated',
                    message=f'{milestone.title} was updated in {project.name}.',
                )
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
        return Response(ActivitySerializer(
            activities[:100], many=True, context={'request': request}
        ).data)

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
        sprint_goal = sprint.tasks.filter(is_archived=False)
        sprint_total = sprint_goal.count()
        sprint_completed = sprint_goal.filter(status='COMPLETED').count()
        completion_percent = round(sprint_completed * 100 / sprint_total) if sprint_total else 0
        Activity.objects.create(
            project=project, actor=request.user, action=action_type,
            details={
                'sprint_id': sprint.id,
                'sprint_name': sprint.name,
                **({
                    'completion_percent': completion_percent,
                    'completed_tasks': sprint_completed,
                    'total_tasks': sprint_total,
                } if new_status == Sprint.Status.COMPLETED else {}),
            },
        )
        if new_status == Sprint.Status.ACTIVE:
            notify_project_members(
                project=project,
                sprint=sprint,
                actor=request.user,
                kind=Notification.NotificationTypes.SPRINT_STARTED,
                title='Sprint started',
                message=f'{sprint.name} has started.',
            )
        else:
            from progress.services import award_completed_sprint
            award_completed_sprint(sprint)
        return Response(SprintSerializer(sprint).data)
