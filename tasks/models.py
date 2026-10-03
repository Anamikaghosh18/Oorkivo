from django.db import models
from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from projects.models import Project
from organizations.models import OrganizationMembership
import os
from django.core.validators import FileExtensionValidator


def attachment_upload_path(instance, filename):
    return os.path.join('task-attachments', str(instance.task.project_id), str(instance.task_id), filename)


class TaskAttachment(models.Model):
    task = models.ForeignKey('Task', on_delete=models.CASCADE, related_name='attachments')
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='task_attachments'
    )
    file = models.FileField(
        upload_to=attachment_upload_path,
        validators=[FileExtensionValidator(
            allowed_extensions=['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'txt', 'csv', 'doc', 'docx', 'xls', 'xlsx', 'zip']
        )],
    )
    filename = models.CharField(max_length=255)
    file_size = models.PositiveBigIntegerField()
    content_type = models.CharField(max_length=150)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.filename


class SavedTaskView(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='saved_task_views'
    )
    name = models.CharField(max_length=100)
    filters = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name', 'created_at']

    def __str__(self):
        return f"{self.name} ({self.user})"

class Task(models.Model):
    class Status(models.TextChoices):
        BACKLOG = 'BACKLOG', 'Backlog'
        TODO = 'TODO', 'To Do'
        IN_PROGRESS = 'IN_PROGRESS', 'In Progress'
        IN_REVIEW = 'IN_REVIEW', 'In Review'
        COMPLETED = 'COMPLETED', 'Completed'
        BLOCKED = 'BLOCKED', 'Blocked'

    class Priority(models.TextChoices):
        LOW = 'LOW', 'Low'
        MEDIUM = 'MEDIUM', 'Medium'
        HIGH = 'HIGH', 'High'
        URGENT = 'URGENT', 'Urgent'

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='tasks')
    sprint = models.ForeignKey(
        'projects.Sprint', on_delete=models.SET_NULL, null=True, blank=True, related_name='tasks'
    )
    backlog_order = models.PositiveIntegerField(default=0)
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, 
        on_delete=models.CASCADE, 
        related_name='created_tasks'
    )
    
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True, 
        related_name='assigned_tasks'
    )
    
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.TODO)
    priority = models.CharField(max_length=20, choices=Priority.choices, default=Priority.MEDIUM)
    due_date = models.DateField(null=True, blank=True)
    parent_task = models.ForeignKey(
        'self', on_delete=models.CASCADE, null=True, blank=True, related_name='subtasks'
    )
    dependencies = models.ManyToManyField(
        'self', symmetrical=False, blank=True, related_name='dependents'
    )
    estimated_hours = models.DecimalField(
        max_digits=6, decimal_places=2, null=True, blank=True, validators=[MinValueValidator(0)]
    )
    actual_hours = models.DecimalField(
        max_digits=6, decimal_places=2, null=True, blank=True, validators=[MinValueValidator(0)]
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=['project', 'status']),
            models.Index(fields=['assigned_to', 'status']),
            models.Index(fields=['due_date']),
        ]
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.title} - {self.status}"

    def clean(self):
        super().clean()
        
        # 1. Assigned user must belong to the project's organization.
        if self.assigned_to:
            is_org_member = OrganizationMembership.objects.filter(
                user=self.assigned_to,
                organization=self.project.organization,
                is_active=True,
                status=OrganizationMembership.Status.ACTIVE,
            ).exists()
            if not is_org_member:
                raise ValidationError({
                    'assigned_to': "The assigned user must be an active member of the project's organization."
                })
        if self.parent_task_id and self.parent_task_id == self.pk:
            raise ValidationError({'parent_task': 'A task cannot be its own parent.'})
        if self.parent_task_id and self.parent_task.project_id != self.project_id:
            raise ValidationError({'parent_task': 'Parent task must belong to the same project.'})
        if self.sprint_id and self.sprint.project_id != self.project_id:
            raise ValidationError({'sprint': 'Sprint must belong to the same project.'})

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)
