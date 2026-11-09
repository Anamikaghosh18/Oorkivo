from django.contrib.auth.models import AbstractUser
from django.conf import settings
from django.db import models

class User(AbstractUser):
    email = models.EmailField(unique=True)
    avatar = models.FileField(upload_to='user-avatars/', blank=True, null=True)
    timezone = models.CharField(max_length=64, default='UTC')
    
    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['username']

    def __str__(self):
        return self.email


class UserPreferences(models.Model):
    class Theme(models.TextChoices):
        SYSTEM = 'SYSTEM', 'System'
        LIGHT = 'LIGHT', 'Light'
        DARK = 'DARK', 'Dark'

    class TaskView(models.TextChoices):
        MY_WORK = 'MY_WORK', 'My Work'
        LIST = 'LIST', 'List'
        BOARD = 'BOARD', 'Board'

    class ProjectView(models.TextChoices):
        OVERVIEW = 'OVERVIEW', 'Overview'
        TASKS = 'TASKS', 'Tasks'
        ACTIVITY = 'ACTIVITY', 'Activity'
        DOCS = 'DOCS', 'Docs'

    class TaskOpenBehavior(models.TextChoices):
        SAME_PAGE = 'SAME_PAGE', 'Same page'
        DETAIL_VIEW = 'DETAIL_VIEW', 'Detail view'

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='preferences'
    )
    theme = models.CharField(max_length=10, choices=Theme.choices, default=Theme.SYSTEM)
    default_task_view = models.CharField(max_length=10, choices=TaskView.choices, default=TaskView.MY_WORK)
    default_project_view = models.CharField(max_length=10, choices=ProjectView.choices, default=ProjectView.OVERVIEW)
    task_open_behavior = models.CharField(max_length=12, choices=TaskOpenBehavior.choices, default=TaskOpenBehavior.DETAIL_VIEW)
    task_assignments = models.BooleanField(default=True)
    task_status_changes = models.BooleanField(default=True)
    task_comments = models.BooleanField(default=True)
    task_mentions = models.BooleanField(default=True)
    project_updates = models.BooleanField(default=True)
    milestone_updates = models.BooleanField(default=True)
    sprint_started = models.BooleanField(default=True)
    sprint_ending_soon = models.BooleanField(default=True)
    due_date_reminders = models.BooleanField(default=True)
    overdue_task_reminders = models.BooleanField(default=True)

    def __str__(self):
        return f'Preferences for {self.user}'