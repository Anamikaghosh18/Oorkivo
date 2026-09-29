from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from .models import Organization, OrganizationMembership
from .serializers import OrganizationSerializer, OrganizationMembershipSerializer
from .permissions import IsOrganizationOwner, IsOrganizationAdminOrOwner, IsOrganizationMember
from teams.models import Team
from teams.serializers import TeamSerializer

class OrganizationViewSet(viewsets.ModelViewSet):
    serializer_class = OrganizationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Organization.objects.filter(memberships__user=self.request.user, memberships__is_active=True).distinct()

    def get_permissions(self):
        if self.action in ['update', 'partial_update', 'destroy']:
            return [IsAuthenticated(), IsOrganizationOwner()]
        if self.action in ['retrieve', 'members', 'teams']:
            return [IsAuthenticated(), IsOrganizationMember()]
        return super().get_permissions()

    def perform_create(self, serializer):
        org = serializer.save()
        OrganizationMembership.objects.create(
            user=self.request.user,
            organization=org,
            access_level=OrganizationMembership.AccessLevel.OWNER,
            job_title="Founder"
        )

    @action(detail=True, methods=['get', 'post'], permission_classes=[IsAuthenticated, IsOrganizationAdminOrOwner])
    def members(self, request, pk=None):
        org = self.get_object()
        
        if request.method == 'GET':
            members = OrganizationMembership.objects.filter(organization=org)
            serializer = OrganizationMembershipSerializer(members, many=True)
            return Response(serializer.data)
            
        elif request.method == 'POST':
            serializer = OrganizationMembershipSerializer(data=request.data)
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