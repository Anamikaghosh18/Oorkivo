from django.db import models
from django.conf import settings
from django.core.exceptions import ValidationError
from organizations.models import Organization, OrganizationMembership
from teams.models import Team

class Project(models.Model):
    class Status(models.TextChoices):
        PLANNING = 'PLANNING', 'Planning'
        ACTIVE = 'ACTIVE', 'Active'
        ON_HOLD = 'ON_HOLD', 'On Hold'
        COMPLETED = 'COMPLETED', 'Completed'

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='projects')
    # Optional: A project can belong to a specific team, or be cross-functional (null)
    team = models.ForeignKey(Team, on_delete=models.SET_NULL, null=True, blank=True, related_name='projects')
    
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PLANNING)
    
    # Dates are crucial for future AI risk detection (is the project behind schedule?)
    start_date = models.DateField(null=True, blank=True)
    target_end_date = models.DateField(null=True, blank=True)
    actual_end_date = models.DateField(null=True, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.name} ({self.organization.name})"

    def clean(self):
        if self.team and self.team.organization != self.organization:
            raise ValidationError("Team must belong to the same organization as the project.")

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

class ProjectMembership(models.Model):
    class ProjectRole(models.TextChoices):
        MANAGER = 'MANAGER', 'Project Manager'
        CONTRIBUTOR = 'CONTRIBUTOR', 'Contributor'
        VIEWER = 'VIEWER', 'Viewer'

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='memberships')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='project_memberships')
    role = models.CharField(max_length=20, choices=ProjectRole.choices, default=ProjectRole.CONTRIBUTOR)
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['user', 'project'], name='unique_project_membership')
        ]

    def clean(self):
        if not OrganizationMembership.objects.filter(
            user=self.user,
            organization=self.project.organization,
            is_active=True,
            status=OrganizationMembership.Status.ACTIVE,
        ).exists():
            raise ValidationError("User must be an active member of the organization to join this project.")

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)


class ProjectMilestone(models.Model):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='milestones')
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    target_date = models.DateField(null=True, blank=True)
    tasks = models.ManyToManyField('tasks.Task', blank=True, related_name='milestones')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['target_date', 'created_at']

    def __str__(self):
        return f"{self.title} - {self.project.name}"


class Sprint(models.Model):
    class Status(models.TextChoices):
        PLANNED = 'PLANNED', 'Planned'
        ACTIVE = 'ACTIVE', 'Active'
        COMPLETED = 'COMPLETED', 'Completed'

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='sprints')
    name = models.CharField(max_length=255)
    goal = models.TextField(blank=True)
    start_date = models.DateField()
    end_date = models.DateField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PLANNED)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='created_sprints')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-start_date', '-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['project'],
                condition=models.Q(status='ACTIVE'),
                name='one_active_sprint_per_project',
            ),
        ]

    def clean(self):
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValidationError({'end_date': 'Sprint end date must be on or after its start date.'})
        if self.status == self.Status.ACTIVE and self.project_id and Sprint.objects.filter(
            project_id=self.project_id, status=self.Status.ACTIVE
        ).exclude(pk=self.pk).exists():
            raise ValidationError({'status': 'A project can only have one active sprint.'})

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)
