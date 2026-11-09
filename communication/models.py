from django.db import models
from django.conf import settings
from django.core.validators import FileExtensionValidator
from tasks.models import Task
from projects.models import Project
from organizations.models import Organization
from teams.models import Team
import os

class TaskComment(models.Model):
    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name='comments')
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='task_comments')
    content = models.TextField(blank=True)
    mentions = models.ManyToManyField(settings.AUTH_USER_MODEL, blank=True, related_name='task_mentions')
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f"Comment by {self.author} on {self.task}"


def task_comment_attachment_upload_path(instance, filename):
    task = instance.comment.task
    return os.path.join(
        'task-comment-attachments',
        str(task.project_id),
        str(task.id),
        str(instance.comment_id),
        filename,
    )


class TaskCommentAttachment(models.Model):
    comment = models.ForeignKey(
        TaskComment, on_delete=models.CASCADE, related_name='attachments'
    )
    file = models.FileField(
        upload_to=task_comment_attachment_upload_path,
        validators=[FileExtensionValidator(
            allowed_extensions=[
                'pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'txt', 'csv',
                'doc', 'docx', 'xls', 'xlsx', 'zip',
            ]
        )],
    )
    filename = models.CharField(max_length=255)
    file_size = models.PositiveBigIntegerField()
    content_type = models.CharField(max_length=150)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at', 'id']

class ProjectComment(models.Model):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='comments')
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='project_comments')
    content = models.TextField()
    mentions = models.ManyToManyField(settings.AUTH_USER_MODEL, blank=True, related_name='project_mentions')
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['created_at']

class Activity(models.Model):
    """System generated activity feed"""
    class ActionTypes(models.TextChoices):
        CREATED = 'CREATED', 'Created'
        ASSIGNED = 'ASSIGNED', 'Assigned'
        STATUS_CHANGED = 'STATUS_CHANGED', 'Status Changed'
        PRIORITY_CHANGED = 'PRIORITY_CHANGED', 'Priority Changed'
        COMPLETED = 'COMPLETED', 'Completed'
        DUE_DATE_CHANGED = 'DUE_DATE_CHANGED', 'Due Date Changed'
        COMMENTED = 'COMMENTED', 'Comment Added'
        MILESTONE_COMPLETED = 'MILESTONE_COMPLETED', 'Milestone Completed'
        MEMBER_ADDED = 'MEMBER_ADDED', 'Member Added'
        MEMBER_REMOVED = 'MEMBER_REMOVED', 'Member Removed'
        MEMBER_ROLE_CHANGED = 'MEMBER_ROLE_CHANGED', 'Member Role Changed'
        PROJECT_ARCHIVED = 'PROJECT_ARCHIVED', 'Project Archived'
        PROJECT_RESTORED = 'PROJECT_RESTORED', 'Project Restored'
        TASK_ARCHIVED = 'TASK_ARCHIVED', 'Task Archived'
        TASK_RESTORED = 'TASK_RESTORED', 'Task Restored'
        TEAM_ARCHIVED = 'TEAM_ARCHIVED', 'Team Archived'
        TEAM_RESTORED = 'TEAM_RESTORED', 'Team Restored'
        PROJECT_UPDATED = 'PROJECT_UPDATED', 'Project Updated'
        TASK_UPDATED = 'TASK_UPDATED', 'Task Updated'
        TEAM_UPDATED = 'TEAM_UPDATED', 'Team Updated'
        SPRINT_CREATED = 'SPRINT_CREATED', 'Sprint Created'
        SPRINT_STARTED = 'SPRINT_STARTED', 'Sprint Started'
        SPRINT_COMPLETED = 'SPRINT_COMPLETED', 'Sprint Completed'
        TASK_MOVED_TO_SPRINT = 'TASK_MOVED_TO_SPRINT', 'Task Moved to Sprint'
        DOCUMENT_CREATED = 'DOCUMENT_CREATED', 'Document Created'
        DOCUMENT_UPDATED = 'DOCUMENT_UPDATED', 'Document Updated'
        DOCUMENT_DELETED = 'DOCUMENT_DELETED', 'Document Deleted'

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='activities')
    task = models.ForeignKey(Task, on_delete=models.CASCADE, null=True, blank=True, related_name='activities')
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='activities')
    
    action = models.CharField(max_length=50, choices=ActionTypes.choices)
    details = models.JSONField(default=dict, blank=True) # e.g. {"old": "TODO", "new": "IN_PROGRESS"}
    
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name_plural = 'Activities'

class Notification(models.Model):
    class NotificationTypes(models.TextChoices):
        MENTION = 'MENTION', 'Mention'
        ASSIGNMENT = 'ASSIGNMENT', 'Assignment'
        UPDATE = 'UPDATE', 'Update'
        TASK_ASSIGNED = 'TASK_ASSIGNED', 'Task assigned'
        TASK_COMMENTED = 'TASK_COMMENTED', 'Task commented'
        TASK_MENTIONED = 'TASK_MENTIONED', 'Task mention'
        TASK_STATUS_CHANGED = 'TASK_STATUS_CHANGED', 'Task status changed'
        PROJECT_UPDATED = 'PROJECT_UPDATED', 'Project updated'
        SPRINT_STARTED = 'SPRINT_STARTED', 'Sprint started'
        SPRINT_ENDING = 'SPRINT_ENDING', 'Sprint ending'
        MILESTONE_UPDATED = 'MILESTONE_UPDATED', 'Milestone updated'
        TASK_DUE = 'TASK_DUE', 'Task due'
        TASK_OVERDUE = 'TASK_OVERDUE', 'Task overdue'
        MEMBER_RECOGNIZED = 'MEMBER_RECOGNIZED', 'Member recognized'
        CHAT_MENTIONED = 'CHAT_MENTIONED', 'Mentioned in chat'

    recipient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='notifications')
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='triggered_notifications')
    
    type = models.CharField(max_length=50, choices=NotificationTypes.choices)
    title = models.CharField(max_length=180, blank=True)
    message = models.CharField(max_length=255)
    
    # Context (Where did this happen?)
    task = models.ForeignKey(Task, on_delete=models.CASCADE, null=True, blank=True)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, null=True, blank=True)
    sprint = models.ForeignKey('projects.Sprint', on_delete=models.CASCADE, null=True, blank=True)
    organization = models.ForeignKey(
        'organizations.Organization', on_delete=models.CASCADE, null=True, blank=True,
        related_name='notifications',
    )
    conversation = models.ForeignKey(
        'ChatConversation', on_delete=models.CASCADE, null=True, blank=True,
        related_name='notifications',
    )
    dedupe_key = models.CharField(max_length=255, unique=True, null=True, blank=True)
    
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']


def chat_attachment_upload_path(instance, filename):
    return os.path.join(
        'chat-attachments',
        str(instance.message.conversation.organization_id),
        str(instance.message.conversation_id),
        str(instance.message_id),
        filename,
    )


class ChatConversation(models.Model):
    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name='chat_conversations'
    )
    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, null=True, blank=True,
        related_name='chat_conversations',
    )
    team = models.ForeignKey(
        Team, on_delete=models.CASCADE, null=True, blank=True,
        related_name='chat_conversations',
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='created_chat_conversations'
    )
    title = models.CharField(max_length=120, blank=True)
    is_group = models.BooleanField(default=False)
    members = models.ManyToManyField(
        settings.AUTH_USER_MODEL, through='ChatParticipant', related_name='chat_conversations'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at', '-id']

    def __str__(self):
        return self.title or f'Chat {self.pk}'


class ChatParticipant(models.Model):
    conversation = models.ForeignKey(
        ChatConversation, on_delete=models.CASCADE, related_name='participants'
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='chat_participations'
    )
    joined_at = models.DateTimeField(auto_now_add=True)
    last_read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['conversation', 'user'], name='unique_chat_participant'
            ),
        ]


class ChatMessage(models.Model):
    conversation = models.ForeignKey(
        ChatConversation, on_delete=models.CASCADE, related_name='messages'
    )
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='chat_messages'
    )
    content = models.TextField(blank=True)
    mentions = models.ManyToManyField(
        settings.AUTH_USER_MODEL, blank=True, related_name='chat_mentions'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['created_at', 'id']


class ChatAttachment(models.Model):
    message = models.ForeignKey(
        ChatMessage, on_delete=models.CASCADE, related_name='attachments'
    )
    file = models.FileField(
        upload_to=chat_attachment_upload_path,
        validators=[FileExtensionValidator(
            allowed_extensions=[
                'pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'txt', 'csv',
                'doc', 'docx', 'xls', 'xlsx', 'zip',
            ]
        )],
    )
    filename = models.CharField(max_length=255)
    file_size = models.PositiveBigIntegerField()
    content_type = models.CharField(max_length=150)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at', 'id']
