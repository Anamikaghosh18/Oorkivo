from django.test import TestCase
from django.urls import reverse
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient
from organizations.models import Organization, OrganizationMembership
from projects.models import Project, ProjectMembership
from tasks.models import Task
from teams.models import Team, TeamMembership
from users.models import User
from .models import (
    ChatAttachment,
    ChatConversation,
    Notification,
    TaskComment,
    TaskCommentAttachment,
)


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

    def test_discussion_comment_uploads_inline_attachment_and_scopes_download(self):
        uploaded_file = SimpleUploadedFile(
            'discussion-notes.txt', b'Notes shared in discussion.', content_type='text/plain'
        )
        response = self.client.post(
            reverse('task-comments-list', kwargs={'task_id': self.task.id}),
            {'content': '', 'files': uploaded_file},
            format='multipart',
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(len(response.data['attachments']), 1)
        attachment = TaskCommentAttachment.objects.get(comment_id=response.data['id'])
        self.assertEqual(response.data['attachments'][0]['filename'], 'discussion-notes.txt')

        download = self.client.get(reverse(
            'task-comment-attachment-download', kwargs={'pk': attachment.id}
        ))
        self.assertEqual(download.status_code, 200)
        download.close()

        self.client.force_authenticate(self.outsider)
        denied = self.client.get(reverse(
            'task-comment-attachment-download', kwargs={'pk': attachment.id}
        ))
        self.assertEqual(denied.status_code, 404)
        attachment.file.delete(save=False)

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


class ChatConversationTests(TestCase):
    def setUp(self):
        self.actor = User.objects.create_user(
            username='chat-actor', email='chat-actor@example.com', password='password'
        )
        self.member = User.objects.create_user(
            username='chat-member', email='chat-member@example.com', password='password'
        )
        self.outsider = User.objects.create_user(
            username='chat-outsider', email='chat-outsider@example.com', password='password'
        )
        self.organization = Organization.objects.create(name='Chat workspace')
        for user in (self.actor, self.member):
            OrganizationMembership.objects.create(user=user, organization=self.organization)
        outsider_organization = Organization.objects.create(name='Other chat workspace')
        OrganizationMembership.objects.create(
            user=self.outsider, organization=outsider_organization
        )
        self.client = APIClient()
        self.client.force_authenticate(self.actor)
        self.client.credentials(HTTP_X_ORGANIZATION_ID=str(self.organization.id))

    def create_conversation(self):
        response = self.client.post(
            reverse('chat-conversation-list'),
            {'member_ids': [self.member.id]},
            format='json',
        )
        self.assertEqual(response.status_code, 201)
        return response.data

    def test_direct_conversation_is_reused_and_mentions_notify_participants(self):
        conversation = self.create_conversation()
        repeated = self.client.post(
            reverse('chat-conversation-list'),
            {'member_ids': [self.member.id]},
            format='json',
        )
        self.assertEqual(repeated.status_code, 200)
        self.assertEqual(repeated.data['id'], conversation['id'])
        self.assertEqual(ChatConversation.objects.count(), 1)
        listing = self.client.get(reverse('chat-conversation-list'))
        self.assertEqual(listing.status_code, 200)
        self.assertEqual([item['id'] for item in listing.data], [conversation['id']])

        message = self.client.post(
            reverse('chat-conversation-messages', kwargs={'pk': conversation['id']}),
            {'content': 'Can you review this?', 'mentions': [self.member.id]},
            format='json',
        )
        self.assertEqual(message.status_code, 201)
        notification = Notification.objects.get(recipient=self.member)
        self.assertEqual(notification.type, Notification.NotificationTypes.CHAT_MENTIONED)
        self.assertEqual(notification.conversation_id, conversation['id'])

    def test_conversation_rejects_outsiders_and_mentions_outside_the_chat(self):
        invalid_conversation = self.client.post(
            reverse('chat-conversation-list'),
            {'member_ids': [self.outsider.id]},
            format='json',
        )
        self.assertEqual(invalid_conversation.status_code, 400)
        conversation = self.create_conversation()
        invalid_message = self.client.post(
            reverse('chat-conversation-messages', kwargs={'pk': conversation['id']}),
            {'content': 'Private mention.', 'mentions': [self.outsider.id]},
            format='json',
        )
        self.assertEqual(invalid_message.status_code, 400)

        self.client.force_authenticate(self.outsider)
        listing = self.client.get(reverse('chat-conversation-list'))
        self.assertEqual(listing.status_code, 200)
        self.assertEqual(listing.data, [])
        detail = self.client.get(
            reverse('chat-conversation-detail', kwargs={'pk': conversation['id']})
        )
        self.assertEqual(detail.status_code, 404)

    def test_project_and_team_conversations_are_categorized_and_member_scoped(self):
        project = Project.objects.create(
            organization=self.organization, name='Context project'
        )
        for user in (self.actor, self.member):
            ProjectMembership.objects.create(project=project, user=user)
        project_chat = self.client.post(
            reverse('chat-conversation-list'),
            {'member_ids': [self.member.id], 'project_id': project.id},
            format='json',
        )
        self.assertEqual(project_chat.status_code, 201)
        self.assertEqual(project_chat.data['project'], project.id)
        self.assertIsNone(project_chat.data['team'])

        team = Team.objects.create(organization=self.organization, name='Context team')
        for user in (self.actor, self.member):
            TeamMembership.objects.create(team=team, user=user)
        team_chat = self.client.post(
            reverse('chat-conversation-list'),
            {'member_ids': [self.member.id], 'team_id': team.id},
            format='json',
        )
        self.assertEqual(team_chat.status_code, 201)
        self.assertEqual(team_chat.data['team'], team.id)
        self.assertIsNone(team_chat.data['project'])

        listing = self.client.get(reverse('chat-conversation-list'))
        self.assertEqual(listing.status_code, 200)
        self.assertEqual(len(listing.data), 2)
        self.assertEqual(
            {item['project'] for item in listing.data if item['project']},
            {project.id},
        )
        self.assertEqual(
            {item['team'] for item in listing.data if item['team']},
            {team.id},
        )

    def test_chat_attachment_is_uploaded_and_download_requires_membership(self):
        conversation = self.create_conversation()
        uploaded_file = SimpleUploadedFile(
            'meeting-notes.txt', b'Notes from the call.', content_type='text/plain'
        )
        response = self.client.post(
            reverse('chat-conversation-messages', kwargs={'pk': conversation['id']}),
            {'files': uploaded_file},
            format='multipart',
        )
        self.assertEqual(response.status_code, 201)
        attachment = ChatAttachment.objects.get(message_id=response.data['id'])
        download = self.client.get(reverse(
            'chat-conversation-attachment',
            kwargs={'pk': conversation['id'], 'attachment_id': attachment.id},
        ))
        self.assertEqual(download.status_code, 200)
        download.close()

        self.client.force_authenticate(self.outsider)
        denied = self.client.get(reverse(
            'chat-conversation-attachment',
            kwargs={'pk': conversation['id'], 'attachment_id': attachment.id},
        ))
        self.assertEqual(denied.status_code, 404)

# Create your tests here.
