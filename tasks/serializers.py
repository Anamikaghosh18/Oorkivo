from rest_framework import serializers
from .models import Task
from organizations.serializers import UserMinimalSerializer
from projects.serializers import ProjectSerializer
from users.models import User
from projects.models import Project

class MinimalProjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = Project
        fields = ['id', 'name']

class TaskSerializer(serializers.ModelSerializer):
    # Read-only nested fields
    created_by = UserMinimalSerializer(read_only=True)
    assigned_to_detail = UserMinimalSerializer(source='assigned_to', read_only=True)
    project_detail = MinimalProjectSerializer(source='project', read_only=True)
    
    # Write-only ID fields
    assigned_to = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), 
        required=False, 
        allow_null=True
    )
    
    class Meta:
        model = Task
        fields = [
            'id', 'title', 'description', 'status', 'priority', 'due_date',
            'project', 'project_detail', 'created_by', 'assigned_to', 'assigned_to_detail',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'project', 'created_by', 'created_at', 'updated_at']

    def to_representation(self, instance):
        rep = super().to_representation(instance)
        
        
        rep['assigned_to'] = rep.pop('assigned_to_detail', None)
        rep['project'] = rep.pop('project_detail', None)
        
        return rep
