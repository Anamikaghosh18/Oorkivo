from rest_framework import serializers
from .models import Organization, OrganizationMembership
from users.models import User

class UserMinimalSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'email', 'first_name', 'last_name']

class OrganizationMembershipSerializer(serializers.ModelSerializer):
    user = UserMinimalSerializer(read_only=True)
    user_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), source='user', write_only=True
    )

    class Meta:
        model = OrganizationMembership
        fields = ['id', 'user', 'user_id', 'organization', 'access_level', 'job_title', 'is_active', 'joined_at']
        read_only_fields = ['organization', 'joined_at']

class OrganizationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = ['id', 'name', 'created_at']