from django.db.models import Q
from rest_framework import generics, status
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from organizations.context import active_organization_ids, current_organization_id
from organizations.models import Organization, OrganizationMembership
from communication.models import Activity, Notification
from projects.models import Project, ProjectMembership, Sprint
from tasks.models import Task
from teams.models import Team, TeamMembership

from .models import PeerRecognition
from .serializers import PeerRecognitionSerializer
from .services import member_progress


def get_current_organization(request):
    organization_id = current_organization_id(request)
    memberships = OrganizationMembership.objects.filter(
        user=request.user,
        is_active=True,
        status=OrganizationMembership.Status.ACTIVE,
    )
    if organization_id is None:
        organization_id = memberships.values_list('organization_id', flat=True).first()
    organization = Organization.objects.filter(
        id=organization_id, id__in=active_organization_ids(request.user)
    ).first()
    if organization is None:
        raise NotFound('Choose an organization you actively belong to.')
    return organization


def is_org_admin(user, organization):
    return OrganizationMembership.objects.filter(
        user=user,
        organization=organization,
        is_active=True,
        status=OrganizationMembership.Status.ACTIVE,
        access_level__in=[
            OrganizationMembership.AccessLevel.OWNER,
            OrganizationMembership.AccessLevel.ADMIN,
        ],
    ).exists()


def can_view_team_progress(user, organization):
    return (
        is_org_admin(user, organization)
        or TeamMembership.objects.filter(
            user=user,
            team__organization=organization,
            role=TeamMembership.TeamRole.LEAD,
        ).exists()
        or ProjectMembership.objects.filter(
            user=user,
            project__organization=organization,
            role=ProjectMembership.ProjectRole.MANAGER,
        ).exists()
    )


class MyProgressView(generics.GenericAPIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        organization = get_current_organization(request)
        summary = member_progress(request.user, organization)
        if summary is None:
            raise PermissionDenied('You are not an active member of this organization.')
        summary['can_view_team_progress'] = can_view_team_progress(request.user, organization)
        if summary['profile']['avatar_url']:
            summary['profile']['avatar_url'] = request.build_absolute_uri(summary['profile']['avatar_url'])
        return Response(summary)


class OrganizationProgressMembersView(generics.GenericAPIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        organization = get_current_organization(request)
        memberships = OrganizationMembership.objects.filter(
            organization=organization,
            is_active=True,
            status=OrganizationMembership.Status.ACTIVE,
        ).select_related('user')
        return Response([{
            'id': membership.user_id,
            'first_name': membership.user.first_name,
            'last_name': membership.user.last_name,
            'email': membership.user.email,
            'avatar_url': (
                request.build_absolute_uri(membership.user.avatar.url)
                if membership.user.avatar else None
            ),
        } for membership in memberships])


class ProgressOverviewView(generics.GenericAPIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        organization = get_current_organization(request)
        admin_access = is_org_admin(request.user, organization)
        lead_team_ids = TeamMembership.objects.filter(
            user=request.user,
            team__organization=organization,
            role=TeamMembership.TeamRole.LEAD,
        ).values_list('team_id', flat=True)
        managed_project_ids = ProjectMembership.objects.filter(
            user=request.user,
            project__organization=organization,
            role=ProjectMembership.ProjectRole.MANAGER,
        ).values_list('project_id', flat=True)
        if not admin_access and not lead_team_ids.exists() and not managed_project_ids.exists():
            raise PermissionDenied('Manager access is required to view team progress.')

        projects = Project.objects.filter(organization=organization, is_archived=False)
        if not admin_access:
            projects = projects.filter(
                Q(id__in=managed_project_ids) | Q(team_id__in=lead_team_ids)
            )
        requested_project = request.query_params.get('project')
        if requested_project:
            projects = projects.filter(id=requested_project)
        project_rows = list(projects.select_related('team'))
        project_ids = [project.id for project in project_rows]

        teams = Team.objects.filter(organization=organization, is_archived=False)
        if not admin_access:
            teams = teams.filter(Q(id__in=lead_team_ids) | Q(projects__id__in=project_ids)).distinct()
        requested_team = request.query_params.get('team')
        if requested_team:
            teams = teams.filter(id=requested_team)
        team_rows = list(teams.distinct())

        project_summaries = []
        for project in project_rows:
            project_tasks = Task.objects.filter(
                project=project, is_archived=False
            )
            total_tasks = project_tasks.count()
            completed_tasks = project_tasks.filter(status=Task.Status.COMPLETED).count()
            active_sprint = project.sprints.filter(status=Sprint.Status.ACTIVE).first()
            sprint_data = None
            if active_sprint:
                sprint_tasks = active_sprint.tasks.filter(is_archived=False)
                sprint_total = sprint_tasks.count()
                sprint_completed = sprint_tasks.filter(status=Task.Status.COMPLETED).count()
                sprint_data = {
                    'name': active_sprint.name,
                    'completed_tasks': sprint_completed,
                    'total_tasks': sprint_total,
                    'completion_percent': round(sprint_completed * 100 / sprint_total) if sprint_total else 0,
                }
            project_summaries.append({
                'id': project.id,
                'name': project.name,
                'status': project.status,
                'team': project.team.name if project.team else '',
                'completed_tasks': completed_tasks,
                'total_tasks': total_tasks,
                'completion_percent': round(completed_tasks * 100 / total_tasks) if total_tasks else 0,
                'active_sprint': sprint_data,
            })

        team_summaries = []
        for team in team_rows:
            team_project_rows = [
                project for project in project_rows if project.team_id == team.id
            ]
            total_tasks = sum(
                Task.objects.filter(project=project, is_archived=False).count()
                for project in team_project_rows
            )
            completed_tasks = sum(
                Task.objects.filter(
                    project=project,
                    is_archived=False,
                    status=Task.Status.COMPLETED,
                ).count()
                for project in team_project_rows
            )
            team_summaries.append({
                'id': team.id,
                'name': team.name,
                'project_count': len(team_project_rows),
                'completed_tasks': completed_tasks,
                'total_tasks': total_tasks,
                'completion_percent': round(completed_tasks * 100 / total_tasks) if total_tasks else 0,
            })
        return Response({
            'teams': team_summaries,
            'projects': project_summaries,
        })


class TeamCelebrationsView(generics.GenericAPIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        organization = get_current_organization(request)
        projects = Project.objects.filter(organization=organization, is_archived=False)
        if not is_org_admin(request.user, organization):
            projects = projects.filter(
                Q(memberships__user=request.user)
                | Q(team__memberships__user=request.user)
                | Q(tasks__assigned_to=request.user)
            )
        project_ids = projects.values_list('id', flat=True).distinct()
        activity_rows = Activity.objects.filter(project_id__in=project_ids).filter(
            Q(action=Activity.ActionTypes.MILESTONE_COMPLETED)
            | Q(
                action=Activity.ActionTypes.SPRINT_COMPLETED,
                details__completion_percent__gt=0,
            )
            | Q(details__celebration__in=['PROJECT_PROGRESS', 'PROJECT_COMPLETED'])
        ).select_related('project').order_by('-created_at')[:20]

        celebrations = []
        for activity in activity_rows:
            details = activity.details or {}
            if activity.action == Activity.ActionTypes.MILESTONE_COMPLETED:
                headline = 'Project milestone unlocked'
                message = f"{details.get('milestone_title') or 'A project milestone'} is complete."
                kind = 'milestone'
            elif activity.action == Activity.ActionTypes.SPRINT_COMPLETED:
                completion_percent = details.get('completion_percent', 0)
                headline = 'Sprint completed'
                message = (
                    f"{details.get('sprint_name') or 'The sprint'} completed "
                    f"with {completion_percent}% of its goal reached."
                )
                kind = 'sprint'
            elif details.get('celebration') == 'PROJECT_COMPLETED':
                headline = 'Project completed'
                message = f"{activity.project.name} is complete."
                kind = 'project'
            else:
                completion_percent = details.get('completion_percent', 0)
                headline = 'Project milestone reached'
                message = f"{activity.project.name} is now {completion_percent}% complete."
                kind = 'project'
            celebrations.append({
                'id': activity.id,
                'kind': kind,
                'headline': headline,
                'message': message,
                'project': activity.project.name,
                'created_at': activity.created_at,
            })
        return Response(celebrations)


class RecognitionListCreateView(generics.ListCreateAPIView):
    serializer_class = PeerRecognitionSerializer
    permission_classes = [IsAuthenticated]

    def get_organization(self):
        return get_current_organization(self.request)

    def get_queryset(self):
        organization = self.get_organization()
        return PeerRecognition.objects.filter(
            organization=organization,
        ).filter(
            Q(giver=self.request.user) | Q(recipient=self.request.user)
        ).select_related('giver', 'recipient')

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['organization'] = self.get_organization()
        return context

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        recognition = serializer.save()
        from .services import refresh_member_achievements
        refresh_member_achievements(recognition.recipient, recognition.organization)
        Notification.objects.create(
            recipient=recognition.recipient,
            actor=request.user,
            type=Notification.NotificationTypes.MEMBER_RECOGNIZED,
            title='You received recognition',
            message=f'{request.user.get_full_name() or request.user.email} recognized your {recognition.get_category_display().lower()}.',
            organization=recognition.organization,
        )
        return Response(
            self.get_serializer(recognition).data,
            status=status.HTTP_201_CREATED,
        )
