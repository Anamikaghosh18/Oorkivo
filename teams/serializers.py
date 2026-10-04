from rest_framework import serializers
from .models import Team, TeamMembership
from organizations.serializers import UserMinimalSerializer
from organizations.models import OrganizationMembership
from users.models import User

class TeamMembershipSerializer(serializers.ModelSerializer):
    user = UserMinimalSerializer(read_only=True)
    user_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), source='user', write_only=True
    )

    class Meta:
        model = TeamMembership
        fields = ['id', 'user', 'user_id', 'team', 'role', 'joined_at']
        read_only_fields = ['team', 'joined_at']

    def validate(self, attrs):
        team = self.context.get('team') or getattr(self.instance, 'team', None)
        user = attrs.get('user', getattr(self.instance, 'user', None))
        if user and team and not OrganizationMembership.objects.filter(
            user=user,
            organization=team.organization,
            is_active=True,
            status=OrganizationMembership.Status.ACTIVE,
        ).exists():
            raise serializers.ValidationError({
                'user_id': 'The selected user must be an active member of this team’s organization.'
            })
        return attrs

class TeamSerializer(serializers.ModelSerializer):
    class Meta:
        model = Team
        fields = ['id', 'organization', 'name', 'description', 'is_archived', 'created_at']
        read_only_fields = ['organization', 'is_archived', 'created_at']