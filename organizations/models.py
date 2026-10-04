from django.db import models
from django.conf import settings
from django.utils import timezone
from datetime import timedelta
import secrets
import uuid


def generate_invitation_code():
    alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
    return f"OK-{''.join(secrets.choice(alphabet) for _ in range(12))}"


class Organization(models.Model):
    class Plan(models.TextChoices):
        FREE = 'FREE', 'Free'
        PRO = 'PRO', 'Pro'
        ENTERPRISE = 'ENTERPRISE', 'Enterprise'

    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    logo = models.FileField(upload_to='organization-logos/', blank=True, null=True)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='owned_organizations',
        null=True,
        blank=True,
    )
    plan = models.CharField(max_length=20, choices=Plan.choices, default=Plan.FREE)
    created_at = models.DateTimeField(auto_now_add=True)

    PLAN_FEATURES = {
        Plan.FREE: frozenset(),
        Plan.PRO: frozenset({'ADVANCED_ANALYTICS', 'ADVANCED_REPORTS', 'TEAM_ANALYTICS'}),
        Plan.ENTERPRISE: frozenset({
            'ADVANCED_ANALYTICS', 'ADVANCED_REPORTS', 'TEAM_ANALYTICS',
            'SSO', 'AUDIT_LOGS',
        }),
    }

    def has_feature(self, feature):
        return feature in self.PLAN_FEATURES.get(self.plan, frozenset())
    
    def __str__(self):
        return self.name

class OrganizationMembership(models.Model):
    class AccessLevel(models.TextChoices):
        OWNER = 'OWNER', 'Owner'
        ADMIN = 'ADMIN', 'Admin'
        MEMBER = 'MEMBER', 'Member'

    class Status(models.TextChoices):
        ACTIVE = 'ACTIVE', 'Active'
        INVITED = 'INVITED', 'Invited'
        SUSPENDED = 'SUSPENDED', 'Suspended'
        REMOVED = 'REMOVED', 'Removed'

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='org_memberships')
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='memberships')
    access_level = models.CharField(max_length=20, choices=AccessLevel.choices, default=AccessLevel.MEMBER)
    job_title = models.CharField(max_length=100, blank=True, null=True, help_text="e.g., Engineering Manager")
    is_active = models.BooleanField(default=True)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.ACTIVE)
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['user', 'organization'], name='unique_org_membership')
        ]

    def __str__(self):
        return f"{self.user.email} - {self.organization.name} ({self.access_level})"


def invitation_expiry():
    return timezone.now() + timedelta(days=7)


class OrganizationInvitation(models.Model):
    class Status(models.TextChoices):
        PENDING = 'PENDING', 'Pending'
        ACCEPTED = 'ACCEPTED', 'Accepted'
        REVOKED = 'REVOKED', 'Revoked'

    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name='invitations'
    )
    email = models.EmailField(blank=True)
    invitation_code = models.CharField(
        max_length=15, unique=True, default=generate_invitation_code, editable=False
    )
    access_level = models.CharField(
        max_length=20,
        choices=[
            (OrganizationMembership.AccessLevel.ADMIN, 'Admin'),
            (OrganizationMembership.AccessLevel.MEMBER, 'Member'),
        ],
        default=OrganizationMembership.AccessLevel.MEMBER,
    )
    token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PENDING)
    invited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='sent_organization_invitations'
    )
    expires_at = models.DateTimeField(default=invitation_expiry)
    created_at = models.DateTimeField(auto_now_add=True)
    accepted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.email} invited to {self.organization.name}'