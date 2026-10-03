from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from .models import Team, TeamMembership
from .serializers import TeamSerializer, TeamMembershipSerializer
from organizations.models import OrganizationMembership
from organizations.context import active_organization_ids, scope_to_current_organization

class TeamViewSet(viewsets.ModelViewSet):
    serializer_class = TeamSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        # Users can only see teams in organizations they belong to
        queryset = Team.objects.filter(
            organization_id__in=active_organization_ids(self.request.user)
        ).distinct()
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
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        team = self.get_object()
        if not self.check_admin_permission(team):
            return Response({'detail': 'Not permitted.'}, status=status.HTTP_403_FORBIDDEN)
        return super().destroy(request, *args, **kwargs)

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
                
            serializer = TeamMembershipSerializer(data=request.data)
            if serializer.is_valid():
                # clean() method will run validation constraints
                try:
                    serializer.save(team=team)
                    return Response(serializer.data, status=status.HTTP_201_CREATED)
                except Exception as e:
                    return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)