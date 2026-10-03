from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from organizations.models import Organization, OrganizationMembership
from projects.models import Project, ProjectMembership
from tasks.models import Task
from users.models import User
from .models import Notification, TaskComment


class TaskCommentNotificationTests(TestCase):
    def setUp(self):
        self.actor = User.objects.create_user(
            username='commenter', email='commenter@example.com', password='password'
        )
        self.mentioned = User.objects.create_user(
            username='mentioned', email='mentioned@example.com', password='password'
        )
        self.outsider = User.objects.create_user(
            username='outsider', email='outsider@example.com', password='password'
        )
        self.organization = Organization.objects.create(name='Comment workspace')
        for user in (self.actor, self.mentioned):
            OrganizationMembership.objects.create(user=user, organization=self.organization)
        outsider_org = Organization.objects.create(name='Other workspace')
        OrganizationMembership.objects.create(user=self.outsider, organization=outsider_org)
        self.project = Project.objects.create(
            organization=self.organization, name='Comment project'
        )
        for user in (self.actor, self.mentioned):
            ProjectMembership.objects.create(
                project=self.project, user=user,
                role=ProjectMembership.ProjectRole.CONTRIBUTOR,
            )
        self.task = Task.objects.create(
            project=self.project, created_by=self.actor, assigned_to=self.actor,
            title='Commented task',
        )
        self.client = APIClient()
        self.client.force_authenticate(self.actor)

    def test_comment_mentions_create_project_scoped_notification(self):
        response = self.client.post(
            reverse('task-comments-list', kwargs={'task_id': self.task.id}),
            {'content': 'Please review this.', 'mentions': [self.mentioned.id]},
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        self.assertTrue(TaskComment.objects.filter(task=self.task, author=self.actor).exists())
        notification = Notification.objects.get(recipient=self.mentioned)
        self.assertEqual(notification.task_id, self.task.id)
        self.assertEqual(notification.type, Notification.NotificationTypes.TASK_MENTIONED)

    def test_comment_cannot_mention_user_outside_project(self):
        response = self.client.post(
            reverse('task-comments-list', kwargs={'task_id': self.task.id}),
            {'content': 'Private mention.', 'mentions': [self.outsider.id]},
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertFalse(TaskComment.objects.filter(task=self.task).exists())

    def test_notification_listing_is_recipient_scoped_and_read_action_updates_state(self):
        notification = Notification.objects.create(
            recipient=self.actor,
            actor=self.mentioned,
            type=Notification.NotificationTypes.TASK_COMMENTED,
            title='A comment was added',
            message='A task has a new comment.',
            task=self.task,
            project=self.project,
        )
        Notification.objects.create(
            recipient=self.mentioned,
            actor=self.actor,
            type=Notification.NotificationTypes.TASK_COMMENTED,
            title='Other notification',
            message='For another user.',
            task=self.task,
            project=self.project,
        )

        listing = self.client.get(reverse('notification-list'))
        self.assertEqual(listing.status_code, 200)
        self.assertEqual(len(listing.data), 1)

        read = self.client.patch(reverse('notification-read', kwargs={'pk': notification.id}))
        self.assertEqual(read.status_code, 200)
        notification.refresh_from_db()
        self.assertTrue(notification.is_read)

# Create your tests here.
