from rest_framework import serializers
from .models import TaskComment, ProjectComment, Activity, Notification
from organizations.serializers import UserMinimalSerializer
from users.models import User

class TaskCommentSerializer(serializers.ModelSerializer):
    author = UserMinimalSerializer(read_only=True)
    mentions_detail = UserMinimalSerializer(source='mentions', many=True, read_only=True)
    mentions = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), many=True, required=False
    )

    class Meta:
        model = TaskComment
        fields = ['id', 'task', 'author', 'content', 'mentions', 'mentions_detail', 'created_at', 'updated_at']
        read_only_fields = ['id', 'task', 'author', 'created_at', 'updated_at']

    def to_representation(self, instance):
        rep = super().to_representation(instance)
        rep['mentions'] = rep.pop('mentions_detail', [])
        return rep

class ProjectCommentSerializer(serializers.ModelSerializer):
    author = UserMinimalSerializer(read_only=True)
    mentions_detail = UserMinimalSerializer(source='mentions', many=True, read_only=True)
    mentions = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), many=True, required=False
    )

    class Meta:
        model = ProjectComment
        fields = ['id', 'project', 'author', 'content', 'mentions', 'mentions_detail', 'created_at', 'updated_at']
        read_only_fields = ['id', 'project', 'author', 'created_at', 'updated_at']

    def to_representation(self, instance):
        rep = super().to_representation(instance)
        rep['mentions'] = rep.pop('mentions_detail', [])
        return rep

class ActivitySerializer(serializers.ModelSerializer):
    actor = UserMinimalSerializer(read_only=True)
    
    class Meta:
        model = Activity
        fields = ['id', 'project', 'task', 'actor', 'action', 'details', 'created_at']
        read_only_fields = fields

class NotificationSerializer(serializers.ModelSerializer):
    actor = UserMinimalSerializer(read_only=True)

    class Meta:
        model = Notification
        fields = ['id', 'actor', 'type', 'message', 'task', 'project', 'is_read', 'created_at']
        read_only_fields = ['id', 'actor', 'type', 'message', 'task', 'project', 'created_at']
