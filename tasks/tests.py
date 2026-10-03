from django.urls import reverse
from rest_framework.test import APIClient
from django.test import TestCase, override_settings
from django.core.files.uploadedfile import SimpleUploadedFile
from tempfile import TemporaryDirectory

from communication.models import Activity
from communication.models import TaskComment
from organizations.models import Organization, OrganizationMembership
from projects.models import Project, ProjectMembership
from tasks.models import SavedTaskView, Task
from users.models import User


class MemberTaskWorkflowTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='member', email='member@example.com', password='password'
        )
        self.other_user = User.objects.create_user(
            username='other', email='other@example.com', password='password'
        )
        self.organization = Organization.objects.create(name='Workspace')
        for user in (self.user, self.other_user):
            OrganizationMembership.objects.create(user=user, organization=self.organization)
        self.project = Project.objects.create(organization=self.organization, name='Project')
        ProjectMembership.objects.create(
            project=self.project,
            user=self.user,
            role=ProjectMembership.ProjectRole.CONTRIBUTOR,
        )
        self.task = Task.objects.create(
            project=self.project,
            created_by=self.user,
            assigned_to=self.user,
            title='Assigned work',
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_assignee_can_update_status_and_history_is_recorded(self):
        response = self.client.patch(
            reverse('task-detail', kwargs={'pk': self.task.id}),
            {'status': Task.Status.IN_PROGRESS},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['status'], Task.Status.IN_PROGRESS)
        self.assertTrue(Activity.objects.filter(
            task=self.task,
            action=Activity.ActionTypes.STATUS_CHANGED,
            actor=self.user,
        ).exists())

    def test_assignee_cannot_reassign_task(self):
        response = self.client.patch(
            reverse('task-detail', kwargs={'pk': self.task.id}),
            {'assigned_to': self.other_user.id},
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.task.refresh_from_db()
        self.assertEqual(self.task.assigned_to_id, self.user.id)

    def test_assignee_can_create_subtask(self):
        response = self.client.post(
            reverse('task-subtasks', kwargs={'pk': self.task.id}),
            {'title': 'Child task'},
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['parent_task'], self.task.id)
        self.assertTrue(Activity.objects.filter(
            task_id=response.data['id'],
            action=Activity.ActionTypes.CREATED,
        ).exists())

    def test_project_member_can_comment_and_comment_is_recorded_as_activity(self):
        response = self.client.post(
            reverse('task-comments-list', kwargs={'task_id': self.task.id}),
            {'content': 'Ready for review.'},
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        self.assertTrue(TaskComment.objects.filter(task=self.task, author=self.user).exists())
        self.assertTrue(Activity.objects.filter(
            task=self.task,
            action=Activity.ActionTypes.COMMENTED,
            actor=self.user,
        ).exists())

    def test_task_dependencies_reject_cycles(self):
        other_task = Task.objects.create(
            project=self.project,
            created_by=self.user,
            assigned_to=self.user,
            title='Another task',
        )
        first_response = self.client.patch(
            reverse('task-detail', kwargs={'pk': self.task.id}),
            {'dependency_ids': [other_task.id]},
            format='json',
        )
        self.assertEqual(first_response.status_code, 200)

        cycle_response = self.client.patch(
            reverse('task-detail', kwargs={'pk': other_task.id}),
            {'dependency_ids': [self.task.id]},
            format='json',
        )
        self.assertEqual(cycle_response.status_code, 400)


class SprintBacklogAttachmentAndSavedViewTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='assignee', email='assignee@example.com', password='password'
        )
        self.viewer = User.objects.create_user(
            username='viewer2', email='viewer2@example.com', password='password'
        )
        self.organization = Organization.objects.create(name='Feature workspace')
        for user in (self.user, self.viewer):
            OrganizationMembership.objects.create(user=user, organization=self.organization)
        self.project = Project.objects.create(organization=self.organization, name='Feature project')
        ProjectMembership.objects.create(
            project=self.project, user=self.user,
            role=ProjectMembership.ProjectRole.CONTRIBUTOR,
        )
        ProjectMembership.objects.create(
            project=self.project, user=self.viewer,
            role=ProjectMembership.ProjectRole.VIEWER,
        )
        self.task = Task.objects.create(
            project=self.project, created_by=self.user, assigned_to=self.user,
            title='Sprint task',
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.media_dir = TemporaryDirectory()
        media_settings = override_settings(MEDIA_ROOT=self.media_dir.name)
        media_settings.enable()
        self.addCleanup(media_settings.disable)
        self.addCleanup(self.media_dir.cleanup)

    def test_assignee_can_move_task_into_and_back_from_sprint(self):
        from projects.models import Sprint

        sprint = Sprint.objects.create(
            project=self.project, name='Iteration 1',
            start_date='2026-10-01', end_date='2026-10-14',
            created_by=self.user,
        )
        url = reverse('task-detail', kwargs={'pk': self.task.id})

        response = self.client.patch(url, {'sprint_id': sprint.id}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['sprint']['id'], sprint.id)

        response = self.client.patch(url, {'sprint_id': None}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data['sprint'])

    def test_task_cannot_be_assigned_to_another_projects_sprint(self):
        from projects.models import Sprint

        another_project = Project.objects.create(
            organization=self.organization, name='Another project'
        )
        sprint = Sprint.objects.create(
            project=another_project, name='Other iteration',
            start_date='2026-10-01', end_date='2026-10-14',
            created_by=self.user,
        )
        response = self.client.patch(
            reverse('task-detail', kwargs={'pk': self.task.id}),
            {'sprint_id': sprint.id},
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.task.refresh_from_db()
        self.assertIsNone(self.task.sprint_id)

    def test_attachment_upload_download_and_project_viewer_access(self):
        upload = SimpleUploadedFile('spec.txt', b'api notes', content_type='text/plain')
        response = self.client.post(
            reverse('task-attachments', kwargs={'pk': self.task.id}),
            {'file': upload},
            format='multipart',
        )

        self.assertEqual(response.status_code, 201)
        attachment_id = response.data['id']
        viewer_client = APIClient()
        viewer_client.force_authenticate(self.viewer)
        list_response = viewer_client.get(
            reverse('task-attachments', kwargs={'pk': self.task.id})
        )
        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(len(list_response.data), 1)

        download = viewer_client.get(reverse(
            'task-attachment-detail',
            kwargs={'pk': self.task.id, 'attachment_id': attachment_id},
        ))
        self.assertEqual(download.status_code, 200)
        self.assertEqual(b''.join(download.streaming_content), b'api notes')

        denied_upload = viewer_client.post(
            reverse('task-attachments', kwargs={'pk': self.task.id}),
            {'file': SimpleUploadedFile('other.txt', b'not allowed', content_type='text/plain')},
            format='multipart',
        )
        self.assertEqual(denied_upload.status_code, 403)

    def test_attachment_upload_rejects_mismatched_file_type(self):
        response = self.client.post(
            reverse('task-attachments', kwargs={'pk': self.task.id}),
            {'file': SimpleUploadedFile('script.exe', b'not allowed', content_type='application/octet-stream')},
            format='multipart',
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.task.attachments.count(), 0)

    def test_saved_views_are_private_to_the_owner(self):
        response = self.client.post(
            reverse('saved-task-view-list'),
            {'name': 'My urgent tasks', 'filters': {'priority': ['URGENT'], 'assignee': 'me'}},
            format='json',
        )
        self.assertEqual(response.status_code, 201)
        view_id = response.data['id']

        viewer_client = APIClient()
        viewer_client.force_authenticate(self.viewer)
        self.assertEqual(viewer_client.get(reverse('saved-task-view-list')).data, [])
        self.assertEqual(viewer_client.get(
            reverse('saved-task-view-detail', kwargs={'pk': view_id})
        ).status_code, 404)

    def test_saved_view_rejects_invalid_filter_values(self):
        response = self.client.post(
            reverse('saved-task-view-list'),
            {'name': 'Invalid view', 'filters': {'quick_view': ['BLOCKED']}},
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(SavedTaskView.objects.count(), 0)
