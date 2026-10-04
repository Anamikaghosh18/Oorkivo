from django.conf import settings
from django.db import models


class XPTransaction(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='xp_transactions'
    )
    organization = models.ForeignKey(
        'organizations.Organization', on_delete=models.CASCADE, related_name='xp_transactions'
    )
    amount = models.PositiveIntegerField()
    reason = models.CharField(max_length=80)
    description = models.CharField(max_length=255)
    source_type = models.CharField(max_length=40)
    source_id = models.PositiveBigIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at', '-id']
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'organization', 'reason', 'source_type', 'source_id'],
                name='unique_xp_source_reward',
            ),
        ]
        indexes = [models.Index(fields=['user', 'organization', '-created_at'])]


class UserAchievement(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='progress_achievements'
    )
    organization = models.ForeignKey(
        'organizations.Organization', on_delete=models.CASCADE, related_name='progress_achievements'
    )
    key = models.CharField(max_length=50)
    unlocked_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['unlocked_at']
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'organization', 'key'], name='unique_member_achievement'
            ),
        ]


class PeerRecognition(models.Model):
    class Category(models.TextChoices):
        TEAMWORK = 'TEAMWORK', 'Teamwork'
        MENTORSHIP = 'MENTORSHIP', 'Mentorship'
        DELIVERY = 'DELIVERY', 'Reliable delivery'
        PROBLEM_SOLVING = 'PROBLEM_SOLVING', 'Problem solving'

    organization = models.ForeignKey(
        'organizations.Organization', on_delete=models.CASCADE, related_name='member_recognitions'
    )
    giver = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='recognitions_given'
    )
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='recognitions_received'
    )
    message = models.CharField(max_length=240)
    category = models.CharField(max_length=40, choices=Category.choices, default=Category.TEAMWORK)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [models.Index(fields=['recipient', 'organization', '-created_at'])]
