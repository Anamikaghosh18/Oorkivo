from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import NotFound
from django.core.exceptions import ValidationError
from django.db import IntegrityError
from .models import Team, TeamMembership
from .serializers import TeamSerializer, TeamMembershipSerializer
from organizations.models import OrganizationMembership
from organizations.context import active_organization_ids, scope_to_current_organization
from communication.models import Activity, Notification
from communication.services import create_notification

class TeamViewSet(viewsets.ModelViewSet):
    serializer_class = TeamSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        # Users can only see teams in organizations they belong to
        queryset = Team.objects.filter(
            organization_id__in=active_organization_ids(self.request.user)
        ).distinct()
        if self.action == 'restore':
            queryset = queryset.filter(is_archived=True)
        elif self.request.query_params.get('include_archived') != 'true':
            queryset = queryset.filter(is_archived=False)
        return scope_to_current_organization(queryset, self.request)

    def check_admin_permission(self, team):
        return OrganizationMembership.objects.filter(
            user=self.request.user,
            organization=team.organization,
            access_level__in=[OrganizationMembership.AccessLevel.OWNER, OrganizationMembership.AccessLevel.ADMIN],
            is_active=True,
            status=OrganizationMembership.Status.ACTIVE,
        ).exists()

    def check_team_lead_permission(self, team):
        return TeamMembership.objects.filter(
            user=self.request.user,
            team=team,
            role=TeamMembership.TeamRole.LEAD
        ).exists()

    def has_team_management_permission(self, team):
        return self.check_admin_permission(team) or self.check_team_lead_permission(team)

    def update(self, request, *args, **kwargs):
        team = self.get_object()
        if not self.has_team_management_permission(team):
            return Response({'detail': 'Not permitted.'}, status=status.HTTP_403_FORBIDDEN)
        previous = {'name': team.name, 'description': team.description}
        response = super().update(request, *args, **kwargs)
        if response.status_code < 400:
            team.refresh_from_db()
            changed = [key for key, value in previous.items() if getattr(team, key) != value]
            if changed:
                for project in team.projects.all():
                    Activity.objects.create(
                        project=project, actor=request.user,
                        action=Activity.ActionTypes.TEAM_UPDATED,
                        details={'team_id': team.id, 'team_name': team.name, 'fields': changed},
                    )
        return response

    def destroy(self, request, *args, **kwargs):
        team = self.get_object()
        if not self.check_admin_permission(team):
            return Response({'detail': 'Not permitted.'}, status=status.HTTP_403_FORBIDDEN)
        linked_projects = team.projects.filter(is_archived=False)
        if linked_projects.exists():
            names = list(linked_projects.values_list('name', flat=True)[:5])
            return Response(
                {'detail': f'Reassign or archive linked projects before archiving this team: {", ".join(names)}.'},
                status=status.HTTP_409_CONFLICT,
            )
        for project in team.projects.all():
            Activity.objects.create(
                project=project, actor=request.user,
                action=Activity.ActionTypes.TEAM_ARCHIVED,
                details={'team_id': team.id, 'team_name': team.name},
            )
        team.is_archived = True
        team.save(update_fields=['is_archived'])
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated])
    def restore(self, request, pk=None):
        team = self.get_object()
        if not self.check_admin_permission(team):
            return Response({'detail': 'Not permitted.'}, status=status.HTTP_403_FORBIDDEN)
        team.is_archived = False
        team.save(update_fields=['is_archived'])
        for project in team.projects.all():
            Activity.objects.create(
                project=project, actor=request.user,
                action=Activity.ActionTypes.TEAM_RESTORED,
                details={'team_id': team.id, 'team_name': team.name},
            )
        return Response(TeamSerializer(team).data)

    @action(detail=True, methods=['get', 'post'])
    def members(self, request, pk=None):
        team = self.get_object()
        
        if request.method == 'GET':
            members = TeamMembership.objects.filter(team=team)
            serializer = TeamMembershipSerializer(members, many=True)
            return Response(serializer.data)
            
        elif request.method == 'POST':
            if not self.has_team_management_permission(team):
                return Response({'detail': 'Not permitted.'}, status=status.HTTP_403_FORBIDDEN)
                
            serializer = TeamMembershipSerializer(
                data=request.data,
                context={**self.get_serializer_context(), 'team': team},
            )
            if serializer.is_valid():
                try:
                    membership = serializer.save(team=team)
                    for project in team.projects.all():
                        Activity.objects.create(
                            project=project,
                            actor=request.user,
                            action=Activity.ActionTypes.MEMBER_ADDED,
                            details={
                                'member_id': membership.user_id,
                                'team_id': team.id,
                                'team_name': team.name,
                            },
                        )
                    project = team.projects.filter(is_archived=False).first()
                    if project:
                        create_notification(
                            recipient=membership.user,
                            actor=request.user,
                            kind=Notification.NotificationTypes.PROJECT_UPDATED,
                            title='You were added to a team',
                            message=f'{request.user.get_full_name() or request.user.email} added you to {team.name}.',
                            project=project,
                        )
                    else:
                        Notification.objects.create(
                            recipient=membership.user,
                            actor=request.user,
                            type=Notification.NotificationTypes.PROJECT_UPDATED,
                            title='You were added to a team',
                            message=f'{request.user.get_full_name() or request.user.email} added you to {team.name}.',
                        )
                    return Response(serializer.data, status=status.HTTP_201_CREATED)
                except (ValidationError, IntegrityError) as e:
                    return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(
        detail=True, methods=['patch', 'delete'],
        url_path=r'members/(?P<membership_id>\d+)',
    )
    def member_detail(self, request, pk=None, membership_id=None):
        team = self.get_object()
        if not self.has_team_management_permission(team):
            return Response({'detail': 'Not permitted.'}, status=status.HTTP_403_FORBIDDEN)
        membership = TeamMembership.objects.filter(team=team, id=membership_id).first()
        if membership is None:
            raise NotFound('Team membership not found.')
        if request.method == 'DELETE':
            for project in team.projects.all():
                Activity.objects.create(
                    project=project, actor=request.user,
                    action=Activity.ActionTypes.MEMBER_REMOVED,
                    details={
                        'member_id': membership.user_id,
                        'team_id': team.id,
                        'team_name': team.name,
                    },
                )
            membership.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        serializer = TeamMembershipSerializer(
            membership, data=request.data, partial=True, context=self.get_serializer_context()
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)