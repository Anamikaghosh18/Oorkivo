from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import ValidationError
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
        if self.action in ['update', 'partial_update', 'destroy']:
            return [IsAuthenticated(), IsOrganizationOwner()]
        if self.action in ['retrieve', 'members', 'teams']:
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
            if serializer.is_valid():
                serializer.save(organization=org)
                return Response(serializer.data, status=status.HTTP_201_CREATED)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['get', 'post'], permission_classes=[IsAuthenticated, IsOrganizationMember])
    def teams(self, request, pk=None):
        org = self.get_object()
        
        if request.method == 'GET':
            teams = org.teams.all()
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
            projects = org.projects.all()
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