from rest_framework import serializers
from .models import Project, ProjectMembership
from organizations.serializers import UserMinimalSerializer
from users.models import User

class ProjectMembershipSerializer(serializers.ModelSerializer):
    user = UserMinimalSerializer(read_only=True)
    user_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), source='user', write_only=True
    )

    class Meta:
        model = ProjectMembership
        fields = ['id', 'user', 'user_id', 'project', 'role', 'joined_at']
        read_only_fields = ['project', 'joined_at']

class ProjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = Project
        fields = [
            'id', 'organization', 'team', 'name', 'description', 
            'status', 'start_date', 'target_end_date', 'actual_end_date', 
            'created_at', 'updated_at'
        ]
        read_only_fields = ['organization', 'created_at', 'updated_at']
