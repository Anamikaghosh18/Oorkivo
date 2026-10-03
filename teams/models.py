from django.db import models
from django.conf import settings
from django.core.exceptions import ValidationError
from organizations.models import Organization, OrganizationMembership

class Team(models.Model):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='teams')
    name = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.organization.name})"

class TeamMembership(models.Model):
    class TeamRole(models.TextChoices):
        LEAD = 'LEAD', 'Team Lead'
        MEMBER = 'MEMBER', 'Member'

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='team_memberships')
    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name='memberships')
    role = models.CharField(max_length=20, choices=TeamRole.choices, default=TeamRole.MEMBER)
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['user', 'team'], name='unique_team_membership')
        ]

    def clean(self):
        # Cross-module validation: User must be in the organization to join its team.
        if not OrganizationMembership.objects.filter(
            user=self.user,
            organization=self.team.organization,
            is_active=True,
            status=OrganizationMembership.Status.ACTIVE,
        ).exists():
            raise ValidationError("User must be an active member of the organization to join this team.")

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)
