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
        if not OrganizationMembership.objects.filter(user=self.user, organization=self.project.organization, is_active=True).exists():
            raise ValidationError("User must be an active member of the organization to join this project.")

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)
