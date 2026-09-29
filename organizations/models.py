from django.db import models
from django.conf import settings

class Organization(models.Model):
    name = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)
    
    def __str__(self):
        return self.name

class OrganizationMembership(models.Model):
    class AccessLevel(models.TextChoices):
        OWNER = 'OWNER', 'Owner'
        ADMIN = 'ADMIN', 'Admin'
        MEMBER = 'MEMBER', 'Member'

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='org_memberships')
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='memberships')
    access_level = models.CharField(max_length=20, choices=AccessLevel.choices, default=AccessLevel.MEMBER)
    job_title = models.CharField(max_length=100, blank=True, null=True, help_text="e.g., Engineering Manager")
    is_active = models.BooleanField(default=True)
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['user', 'organization'], name='unique_org_membership')
        ]

    def __str__(self):
        return f"{self.user.email} - {self.organization.name} ({self.access_level})"