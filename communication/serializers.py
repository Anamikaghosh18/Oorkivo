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
    project_name = serializers.CharField(source='project.name', read_only=True)
    task_title = serializers.SerializerMethodField()

    class Meta:
        model = Activity
        fields = [
            'id', 'project', 'project_name', 'task', 'task_title',
            'actor', 'action', 'details', 'created_at',
        ]
        read_only_fields = fields

    def get_task_title(self, activity):
        return activity.task.title if activity.task_id else None

class NotificationSerializer(serializers.ModelSerializer):
    actor = UserMinimalSerializer(read_only=True)
    sprint_name = serializers.CharField(source='sprint.name', read_only=True)
    related_object_type = serializers.SerializerMethodField()
    related_object_id = serializers.SerializerMethodField()
    target_url = serializers.SerializerMethodField()

    class Meta:
        model = Notification
        fields = [
            'id', 'actor', 'type', 'title', 'message', 'task', 'project',
            'sprint', 'sprint_name', 'organization', 'related_object_type', 'related_object_id',
            'target_url', 'is_read', 'created_at',
        ]
        read_only_fields = fields

    def get_related_object_type(self, notification):
        if notification.task_id:
            return 'task'
        if notification.sprint_id:
            return 'sprint'
        if notification.project_id:
            return 'project'
        return None

    def get_related_object_id(self, notification):
        return notification.task_id or notification.sprint_id or notification.project_id

    def get_target_url(self, notification):
        if notification.task_id:
            return f'/tasks/{notification.task_id}'
        if notification.sprint_id:
            return f'/projects/{notification.sprint.project_id}?sprint={notification.sprint_id}'
        if notification.project_id:
            return f'/projects/{notification.project_id}'
        return None
