from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import NotFound, ValidationError
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from .models import Organization, OrganizationInvitation, OrganizationMembership
from .serializers import (
    OrganizationInvitationCreateSerializer,
    OrganizationInvitationSerializer,
    OrganizationSerializer,
    OrganizationMembershipSerializer,
)
from .permissions import IsOrganizationOwner, IsOrganizationAdminOrOwner, IsOrganizationMember
from .context import active_organization_ids, scope_to_current_organization
from teams.models import Team
from teams.serializers import TeamSerializer
from communication.models import Activity
from communication.serializers import ActivitySerializer
from communication.services import accessible_project_ids

class OrganizationViewSet(viewsets.ModelViewSet):
    serializer_class = OrganizationSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_queryset(self):
        queryset = Organization.objects.filter(
            id__in=active_organization_ids(self.request.user)
        ).distinct()
        return scope_to_current_organization(queryset, self.request, field='id')

    def get_permissions(self):
        if self.action == 'members':
            permission = IsOrganizationMember if self.request.method == 'GET' else IsOrganizationAdminOrOwner
            return [IsAuthenticated(), permission()]
        if self.action in ['update', 'partial_update', 'destroy']:
            return [IsAuthenticated(), IsOrganizationOwner()]
        if self.action in ['retrieve', 'members', 'teams', 'activity']:
            return [IsAuthenticated(), IsOrganizationMember()]
        return super().get_permissions()

    def perform_create(self, serializer):
        org = serializer.save(owner=self.request.user)
        OrganizationMembership.objects.create(
            user=self.request.user,
            organization=org,
            access_level=OrganizationMembership.AccessLevel.OWNER,
            status=OrganizationMembership.Status.ACTIVE,
            job_title="Founder"
        )

    def perform_update(self, serializer):
        previous_logo = serializer.instance.logo.name if serializer.instance.logo else None
        organization = serializer.save()
        if previous_logo and organization.logo.name != previous_logo:
            organization.logo.storage.delete(previous_logo)

    @action(
        detail=True,
        methods=['get', 'post'],
        permission_classes=[IsAuthenticated, IsOrganizationAdminOrOwner],
    )
    def invitations(self, request, pk=None):
        organization = self.get_object()
        if request.method == 'GET':
            invitations = OrganizationInvitation.objects.filter(
                organization=organization,
                status=OrganizationInvitation.Status.PENDING,
                expires_at__gt=timezone.now(),
            )
            return Response(OrganizationInvitationSerializer(
                invitations, many=True, context=self.get_serializer_context()
            ).data)

        serializer = OrganizationInvitationCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data.get('email', '').strip().lower()
        if email and OrganizationMembership.objects.filter(
            organization=organization,
            user__email__iexact=email,
            is_active=True,
            status=OrganizationMembership.Status.ACTIVE,
        ).exists():
            raise ValidationError({'email': 'This person is already a member of the organization.'})
        invitation = None
        if email:
            invitation = OrganizationInvitation.objects.filter(
                organization=organization,
                email__iexact=email,
                status=OrganizationInvitation.Status.PENDING,
                expires_at__gt=timezone.now(),
            ).first()
        if invitation is None:
            invitation = OrganizationInvitation.objects.create(
                organization=organization,
                email=email,
                access_level=serializer.validated_data['access_level'],
                invited_by=request.user,
            )
        else:
            invitation.access_level = serializer.validated_data['access_level']
            invitation.invited_by = request.user
            invitation.save(update_fields=['access_level', 'invited_by'])
        return Response(
            OrganizationInvitationSerializer(
                invitation, context=self.get_serializer_context()
            ).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=['get'], url_path='settings-permissions',
            permission_classes=[IsAuthenticated, IsOrganizationMember])
    def settings_permissions(self, request, pk=None):
        organization = self.get_object()
        return Response(OrganizationSerializer(organization, context=self.get_serializer_context()).data['permissions'])

    @action(detail=True, methods=['get', 'post'], permission_classes=[IsAuthenticated, IsOrganizationAdminOrOwner])
    def members(self, request, pk=None):
        org = self.get_object()
        
        if request.method == 'GET':
            members = OrganizationMembership.objects.filter(organization=org)
            serializer = OrganizationMembershipSerializer(
                members, many=True, context=self.get_serializer_context()
            )
            return Response(serializer.data)
            
        elif request.method == 'POST':
            serializer = OrganizationMembershipSerializer(
                data=request.data,
                context={**self.get_serializer_context(), 'organization': org},
            )
            serializer.is_valid(raise_exception=True)
            user = serializer.validated_data['user']
            existing = OrganizationMembership.objects.filter(
                organization=org, user=user
            ).first()
            if existing and existing.is_active and existing.status == OrganizationMembership.Status.ACTIVE:
                raise ValidationError({'user_id': 'This person is already an active member.'})
            if existing:
                existing = serializer.update(existing, serializer.validated_data)
                existing.status = OrganizationMembership.Status.ACTIVE
                existing.is_active = True
                existing.save(update_fields=['access_level', 'job_title', 'status', 'is_active'])
                return Response(
                    OrganizationMembershipSerializer(
                        existing, context=self.get_serializer_context()
                    ).data,
                    status=status.HTTP_200_OK,
                )
            membership = serializer.save(organization=org)
            return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(
        detail=True,
        methods=['patch', 'delete'],
        url_path=r'members/(?P<membership_id>\d+)',
        permission_classes=[IsAuthenticated, IsOrganizationAdminOrOwner],
    )
    def member_detail(self, request, pk=None, membership_id=None):
        org = self.get_object()
        membership = OrganizationMembership.objects.filter(
            organization=org, id=membership_id
        ).select_related('user').first()
        if membership is None:
            raise NotFound('Organization membership not found.')
        if (
            membership.user_id == org.owner_id
            or membership.access_level == OrganizationMembership.AccessLevel.OWNER
        ):
            raise ValidationError({'detail': 'The organization owner cannot be removed or changed here.'})

        actor_membership = OrganizationMembership.objects.get(
            organization=org,
            user=request.user,
            is_active=True,
            status=OrganizationMembership.Status.ACTIVE,
        )
        if request.method == 'PATCH':
            serializer = OrganizationMembershipSerializer(
                membership,
                data=request.data,
                partial=True,
                context={**self.get_serializer_context(), 'organization': org},
            )
            serializer.is_valid(raise_exception=True)
            new_access = serializer.validated_data.get('access_level', membership.access_level)
            if (
                actor_membership.access_level != OrganizationMembership.AccessLevel.OWNER
                and (
                    membership.access_level == OrganizationMembership.AccessLevel.ADMIN
                    or new_access == OrganizationMembership.AccessLevel.ADMIN
                )
            ):
                return Response(
                    {'detail': 'Only the organization owner can change administrator roles.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
            previous_role = membership.access_level
            updated_membership = serializer.save()
            if previous_role != updated_membership.access_level:
                from projects.models import Project
                from projects.models import ProjectMembership
                from teams.models import TeamMembership
                project_rows = Project.objects.filter(organization=org).filter(
                    Q(memberships__user=membership.user)
                    | Q(team__memberships__user=membership.user)
                ).distinct()
                for project in project_rows:
                    Activity.objects.create(
                        project=project,
                        actor=request.user,
                        action=Activity.ActionTypes.MEMBER_ROLE_CHANGED,
                        details={
                            'member_id': membership.user_id,
                            'old_role': previous_role,
                            'new_role': updated_membership.access_level,
                        },
                    )
            return Response(serializer.data)

        from projects.models import Project, ProjectMembership
        from teams.models import TeamMembership
        project_rows = Project.objects.filter(organization=org).filter(
            Q(memberships__user=membership.user)
            | Q(team__memberships__user=membership.user)
        ).distinct()
        with transaction.atomic():
            for project in project_rows:
                Activity.objects.create(
                    project=project,
                    actor=request.user,
                    action=Activity.ActionTypes.MEMBER_REMOVED,
                    details={
                        'member_id': membership.user_id,
                        'member_name': membership.user.get_full_name() or membership.user.email,
                    },
                )
            ProjectMembership.objects.filter(
                user=membership.user, project__organization=org
            ).delete()
            TeamMembership.objects.filter(
                user=membership.user, team__organization=org
            ).delete()
            membership.status = OrganizationMembership.Status.REMOVED
            membership.is_active = False
            membership.save(update_fields=['status', 'is_active'])
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['get', 'post'], permission_classes=[IsAuthenticated, IsOrganizationMember])
    def teams(self, request, pk=None):
        org = self.get_object()
        
        if request.method == 'GET':
            teams = org.teams.filter(is_archived=False)
            serializer = TeamSerializer(teams, many=True)
            return Response(serializer.data)
            
        elif request.method == 'POST':
            if not IsOrganizationAdminOrOwner().has_object_permission(request, self, org):
                return Response({'detail': 'You do not have permission to create teams.'}, status=status.HTTP_403_FORBIDDEN)
            
            serializer = TeamSerializer(data=request.data)
            if serializer.is_valid():
                serializer.save(organization=org)
                return Response(serializer.data, status=status.HTTP_201_CREATED)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['get', 'post'], permission_classes=[IsAuthenticated, IsOrganizationMember])
    def projects(self, request, pk=None):
        from projects.models import Project
        from projects.serializers import ProjectSerializer
        
        org = self.get_object()
        
        if request.method == 'GET':
            projects = org.projects.filter(is_archived=False)
            # For strictness, could filter further based on membership, 
            # but org members usually see all project names.
            serializer = ProjectSerializer(projects, many=True)
            return Response(serializer.data)
            
        elif request.method == 'POST':
            if not IsOrganizationAdminOrOwner().has_object_permission(request, self, org):
                return Response({'detail': 'You do not have permission to create projects.'}, status=status.HTTP_403_FORBIDDEN)
            
            serializer = ProjectSerializer(data=request.data)
            if serializer.is_valid():
                serializer.save(organization=org)
                return Response(serializer.data, status=status.HTTP_201_CREATED)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['get'], permission_classes=[IsAuthenticated, IsOrganizationMember])
    def activity(self, request, pk=None):
        organization = self.get_object()
        project_ids = accessible_project_ids(request.user, organization.id)
        activities = Activity.objects.filter(
            project_id__in=project_ids,
        ).select_related('actor', 'task', 'project')[:150]
        return Response(ActivitySerializer(activities, many=True, context={'request': request}).data)