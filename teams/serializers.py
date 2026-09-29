from rest_framework import serializers
from .models import Team, TeamMembership
from organizations.serializers import UserMinimalSerializer
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

class TeamSerializer(serializers.ModelSerializer):
    class Meta:
        model = Team
        fields = ['id', 'organization', 'name', 'created_at']
        read_only_fields = ['organization']