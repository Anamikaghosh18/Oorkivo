from django.db import models
from django.conf import settings
from tasks.models import Task
from projects.models import Project

class TaskComment(models.Model):
    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name='comments')
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='task_comments')
    content = models.TextField()
    mentions = models.ManyToManyField(settings.AUTH_USER_MODEL, blank=True, related_name='task_mentions')
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f"Comment by {self.author} on {self.task}"

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
        SPRINT_CREATED = 'SPRINT_CREATED', 'Sprint Created'
        SPRINT_STARTED = 'SPRINT_STARTED', 'Sprint Started'
        SPRINT_COMPLETED = 'SPRINT_COMPLETED', 'Sprint Completed'
        TASK_MOVED_TO_SPRINT = 'TASK_MOVED_TO_SPRINT', 'Task Moved to Sprint'

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

    recipient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='notifications')
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='triggered_notifications')
    
    type = models.CharField(max_length=50, choices=NotificationTypes.choices)
    message = models.CharField(max_length=255)
    
    # Context (Where did this happen?)
    task = models.ForeignKey(Task, on_delete=models.CASCADE, null=True, blank=True)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, null=True, blank=True)
    
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
