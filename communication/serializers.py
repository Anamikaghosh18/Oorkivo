from rest_framework import serializers
from .models import (
    ChatAttachment,
    ChatConversation,
    ChatMessage,
    TaskCommentAttachment,
    TaskComment,
    ProjectComment,
    Activity,
    Notification,
)
from organizations.serializers import UserMinimalSerializer
from users.models import User

class TaskCommentSerializer(serializers.ModelSerializer):
    author = UserMinimalSerializer(read_only=True)
    attachments = serializers.SerializerMethodField()
    mentions_detail = UserMinimalSerializer(source='mentions', many=True, read_only=True)
    mentions = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), many=True, required=False
    )

    class Meta:
        model = TaskComment
        fields = ['id', 'task', 'author', 'content', 'mentions', 'mentions_detail', 'attachments', 'created_at', 'updated_at']
        read_only_fields = ['id', 'task', 'author', 'created_at', 'updated_at']

    def to_representation(self, instance):
        rep = super().to_representation(instance)
        rep['mentions'] = rep.pop('mentions_detail', [])
        return rep

    def get_attachments(self, comment):
        return TaskCommentAttachmentSerializer(
            comment.attachments.all(), many=True, context=self.context
        ).data


class TaskCommentAttachmentSerializer(serializers.ModelSerializer):
    uploaded_by = UserMinimalSerializer(source='comment.author', read_only=True)

    class Meta:
        model = TaskCommentAttachment
        fields = ['id', 'filename', 'file_size', 'content_type', 'created_at', 'uploaded_by']
        read_only_fields = fields

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
            'sprint', 'sprint_name', 'organization', 'conversation',
            'related_object_type', 'related_object_id',
            'target_url', 'is_read', 'created_at',
        ]
        read_only_fields = fields

    def get_related_object_type(self, notification):
        if notification.conversation_id:
            return 'chat'
        if notification.task_id:
            return 'task'
        if notification.sprint_id:
            return 'sprint'
        if notification.project_id:
            return 'project'
        return None

    def get_related_object_id(self, notification):
        return (
            notification.conversation_id
            or notification.task_id
            or notification.sprint_id
            or notification.project_id
        )

    def get_target_url(self, notification):
        if notification.conversation_id:
            return f'/chat?conversation={notification.conversation_id}'
        if notification.task_id:
            return f'/tasks/{notification.task_id}'
        if notification.sprint_id:
            return f'/projects/{notification.sprint.project_id}?sprint={notification.sprint_id}'
        if notification.project_id:
            return f'/projects/{notification.project_id}'
        return None


class ChatAttachmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChatAttachment
        fields = ['id', 'filename', 'file_size', 'content_type', 'created_at']
        read_only_fields = fields


class ChatMessageSerializer(serializers.ModelSerializer):
    sender = UserMinimalSerializer(read_only=True)
    mentions = UserMinimalSerializer(many=True, read_only=True)
    attachments = ChatAttachmentSerializer(many=True, read_only=True)

    class Meta:
        model = ChatMessage
        fields = [
            'id', 'conversation', 'sender', 'content', 'mentions', 'attachments',
            'created_at', 'updated_at',
        ]
        read_only_fields = fields


class ChatConversationSerializer(serializers.ModelSerializer):
    participants = UserMinimalSerializer(source='members', many=True, read_only=True)
    project_name = serializers.CharField(source='project.name', read_only=True, allow_null=True)
    team_name = serializers.CharField(source='team.name', read_only=True, allow_null=True)
    last_message = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()

    class Meta:
        model = ChatConversation
        fields = [
            'id', 'organization', 'project', 'project_name', 'team', 'team_name',
            'title', 'is_group', 'participants', 'last_message', 'unread_count',
            'created_at', 'updated_at',
        ]
        read_only_fields = fields

    def get_last_message(self, conversation):
        message = conversation.messages.select_related('sender').order_by(
            '-created_at', '-id'
        ).first()
        if message is None:
            return None
        return {
            'id': message.id,
            'content': message.content,
            'sender': UserMinimalSerializer(message.sender, context=self.context).data,
            'created_at': message.created_at,
            'attachment_count': message.attachments.count(),
        }

    def get_unread_count(self, conversation):
        request = self.context.get('request')
        if request is None:
            return 0
        participant = conversation.participants.filter(user=request.user).first()
        if participant is None:
            return 0
        unread = conversation.messages.exclude(sender=request.user)
        if participant.last_read_at:
            unread = unread.filter(created_at__gt=participant.last_read_at)
        return unread.count()
