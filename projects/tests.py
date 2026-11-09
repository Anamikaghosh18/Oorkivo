from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from django.core.exceptions import ValidationError

from communication.models import Activity, Notification
from organizations.models import Organization, OrganizationMembership
from projects.models import Project, ProjectDocument, ProjectMembership, Sprint
from tasks.models import Task
from users.models import User


class ProjectMembershipWorkflowTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username='project-owner', email='project-owner@example.com', password='password'
        )
        self.member = User.objects.create_user(
            username='project-member', email='project-member@example.com', password='password'
        )
        self.organization = Organization.objects.create(name='Project members', owner=self.owner)
        OrganizationMembership.objects.create(
            user=self.owner,
            organization=self.organization,
            access_level=OrganizationMembership.AccessLevel.OWNER,
        )
        self.member_organization_membership = OrganizationMembership.objects.create(
            user=self.member,
            organization=self.organization,
        )
        self.project = Project.objects.create(organization=self.organization, name='Shared project')
        self.client = APIClient()
        self.client.force_authenticate(self.owner)
        self.client.credentials(HTTP_X_ORGANIZATION_ID=str(self.organization.id))

    def test_add_and_remove_project_member_preserves_organization_membership(self):
        response = self.client.post(
            f'/api/projects/{self.project.id}/members/',
            {'user_id': self.member.id},
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        membership_id = response.data['id']
        self.assertTrue(Activity.objects.filter(
            project=self.project,
            actor=self.owner,
            action=Activity.ActionTypes.MEMBER_ADDED,
        ).exists())
        self.assertTrue(Notification.objects.filter(
            recipient=self.member,
            type=Notification.NotificationTypes.PROJECT_UPDATED,
            project=self.project,
        ).exists())

        removed = self.client.delete(
            f'/api/projects/{self.project.id}/members/{membership_id}/'
        )

        self.assertEqual(removed.status_code, 204)
        self.assertFalse(ProjectMembership.objects.filter(
            project=self.project, user=self.member
        ).exists())
        self.assertTrue(OrganizationMembership.objects.filter(
            pk=self.member_organization_membership.pk
        ).exists())
        self.assertTrue(Activity.objects.filter(
            project=self.project,
            actor=self.owner,
            action=Activity.ActionTypes.MEMBER_REMOVED,
        ).exists())

    def test_project_member_must_belong_to_its_organization(self):
        outside = User.objects.create_user(
            username='outside-project', email='outside-project@example.com', password='password'
        )
        response = self.client.post(
            f'/api/projects/{self.project.id}/members/',
            {'user_id': outside.id},
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn('user_id', response.data)

    def test_admin_can_archive_completed_project_and_completed_projects_are_listed(self):
        admin = User.objects.create_user(
            username='project-admin', email='project-admin@example.com', password='password'
        )
        OrganizationMembership.objects.create(
            user=admin,
            organization=self.organization,
            access_level=OrganizationMembership.AccessLevel.ADMIN,
        )
        task = Task.objects.create(
            project=self.project,
            created_by=self.owner,
            title='Completed project task',
            status=Task.Status.COMPLETED,
        )
        self.project.status = Project.Status.COMPLETED
        self.project.save()
        self.client.force_authenticate(admin)

        listed = self.client.get('/api/projects/')
        listed_projects = listed.data if isinstance(listed.data, list) else listed.data['results']
        self.assertEqual(listed.status_code, 200)
        self.assertIn(self.project.id, [item['id'] for item in listed_projects])
        self.assertEqual(
            next(item for item in listed_projects if item['id'] == self.project.id)['status'],
            Project.Status.COMPLETED,
        )

        archived = self.client.delete(f'/api/projects/{self.project.id}/')

        self.assertEqual(archived.status_code, 204)
        self.project.refresh_from_db()
        self.assertTrue(self.project.is_archived)
        self.assertEqual(self.project.status, Project.Status.COMPLETED)
        self.assertTrue(Task.objects.filter(pk=task.pk).exists())


class ProjectMilestoneAccessTests(TestCase):
    def setUp(self):
        self.contributor = User.objects.create_user(
            username='contributor', email='contributor@example.com', password='password'
        )
        self.viewer = User.objects.create_user(
            username='viewer', email='viewer@example.com', password='password'
        )
        organization = Organization.objects.create(name='Workspace')
        for user in (self.contributor, self.viewer):
            OrganizationMembership.objects.create(user=user, organization=organization)
        self.project = Project.objects.create(organization=organization, name='Roadmap project')
        ProjectMembership.objects.create(
            project=self.project, user=self.contributor,
            role=ProjectMembership.ProjectRole.CONTRIBUTOR,
        )
        ProjectMembership.objects.create(
            project=self.project, user=self.viewer,
            role=ProjectMembership.ProjectRole.VIEWER,
        )
        self.task = Task.objects.create(
            project=self.project, created_by=self.contributor,
            assigned_to=self.contributor, title='Authentication',
        )

    def test_contributor_can_create_milestone_and_completion_is_derived(self):
        client = APIClient()
        client.force_authenticate(self.contributor)
        response = client.post(
            reverse('project-milestones', kwargs={'pk': self.project.id}),
            {'title': 'Authentication release', 'tasks': [self.task.id]},
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['completion'], 0)
        milestone_id = response.data['id']

        self.task.status = Task.Status.COMPLETED
        self.task.save()
        milestones = client.get(reverse('project-milestones', kwargs={'pk': self.project.id}))
        self.assertEqual(milestones.status_code, 200)
        self.assertEqual(milestones.data[0]['id'], milestone_id)
        self.assertEqual(milestones.data[0]['completion'], 100)

    def test_viewer_can_read_but_not_create_milestones(self):
        client = APIClient()
        client.force_authenticate(self.viewer)
        url = reverse('project-milestones', kwargs={'pk': self.project.id})

        self.assertEqual(client.get(url).status_code, 200)
        response = client.post(url, {'title': 'Restricted milestone'}, format='json')
        self.assertEqual(response.status_code, 403)


class ProjectDocumentAccessTests(TestCase):
    def setUp(self):
        self.contributor = User.objects.create_user(
            username='doc-contributor', email='doc-contributor@example.com', password='password'
        )
        self.viewer = User.objects.create_user(
            username='doc-viewer', email='doc-viewer@example.com', password='password'
        )
        organization = Organization.objects.create(name='Docs workspace')
        for user in (self.contributor, self.viewer):
            OrganizationMembership.objects.create(user=user, organization=organization)
        self.project = Project.objects.create(organization=organization, name='Docs project')
        ProjectMembership.objects.create(
            project=self.project, user=self.contributor,
            role=ProjectMembership.ProjectRole.CONTRIBUTOR,
        )
        ProjectMembership.objects.create(
            project=self.project, user=self.viewer,
            role=ProjectMembership.ProjectRole.VIEWER,
        )

    def test_contributor_can_create_update_and_delete_document(self):
        client = APIClient()
        client.force_authenticate(self.contributor)
        list_url = reverse('project-documents', kwargs={'pk': self.project.id})

        created = client.post(
            list_url,
            {'title': 'RFC: Authentication', 'content': '# Auth\nMarkdown body'},
            format='json',
        )
        self.assertEqual(created.status_code, 201)
        document_id = created.data['id']
        self.assertEqual(created.data['created_by']['id'], self.contributor.id)

        detail_url = reverse(
            'project-document-detail',
            kwargs={'pk': self.project.id, 'document_id': document_id},
        )
        updated = client.patch(detail_url, {'content': '# Auth\nUpdated'}, format='json')
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.data['content'], '# Auth\nUpdated')
        self.assertEqual(updated.data['updated_by']['id'], self.contributor.id)

        self.assertTrue(Activity.objects.filter(
            project=self.project,
            action=Activity.ActionTypes.DOCUMENT_CREATED,
        ).exists())
        self.assertTrue(Activity.objects.filter(
            project=self.project,
            action=Activity.ActionTypes.DOCUMENT_UPDATED,
        ).exists())

        deleted = client.delete(detail_url)
        self.assertEqual(deleted.status_code, 204)
        self.assertFalse(ProjectDocument.objects.filter(pk=document_id).exists())
        self.assertTrue(Activity.objects.filter(
            project=self.project,
            action=Activity.ActionTypes.DOCUMENT_DELETED,
        ).exists())

    def test_viewer_can_read_but_not_write_documents(self):
        document = ProjectDocument.objects.create(
            project=self.project, title='Spec', content='Body',
            created_by=self.contributor,
        )
        client = APIClient()
        client.force_authenticate(self.viewer)
        list_url = reverse('project-documents', kwargs={'pk': self.project.id})
        detail_url = reverse(
            'project-document-detail',
            kwargs={'pk': self.project.id, 'document_id': document.id},
        )

        listed = client.get(list_url)
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(len(listed.data), 1)
        self.assertEqual(client.get(detail_url).status_code, 200)
        self.assertEqual(client.post(
            list_url, {'title': 'Nope'}, format='json',
        ).status_code, 403)
        self.assertEqual(client.patch(
            detail_url, {'title': 'Nope'}, format='json',
        ).status_code, 403)
        self.assertEqual(client.delete(detail_url).status_code, 403)


class ProjectSprintAccessTests(TestCase):
    def setUp(self):
        self.manager = User.objects.create_user(
            username='sprint-manager', email='sprint-manager@example.com', password='password'
        )
        self.viewer = User.objects.create_user(
            username='sprint-viewer', email='sprint-viewer@example.com', password='password'
        )
        organization = Organization.objects.create(name='Sprint workspace')
        for user in (self.manager, self.viewer):
            OrganizationMembership.objects.create(user=user, organization=organization)
        self.project = Project.objects.create(organization=organization, name='Sprint project')
        ProjectMembership.objects.create(
            project=self.project, user=self.manager,
            role=ProjectMembership.ProjectRole.MANAGER,
        )
        ProjectMembership.objects.create(
            project=self.project, user=self.viewer,
            role=ProjectMembership.ProjectRole.VIEWER,
        )

    def test_manager_can_create_start_and_complete_sprint(self):
        client = APIClient()
        client.force_authenticate(self.manager)
        response = client.post(
            reverse('project-sprints', kwargs={'pk': self.project.id}),
            {
                'name': 'Iteration 1',
                'goal': 'Deliver authentication.',
                'start_date': '2026-10-01',
                'end_date': '2026-10-14',
            },
            format='json',
        )
        self.assertEqual(response.status_code, 201)
        sprint_id = response.data['id']

        start = client.post(reverse(
            'project-start-sprint',
            kwargs={'pk': self.project.id, 'sprint_id': sprint_id},
        ))
        self.assertEqual(start.status_code, 200)
        self.assertEqual(start.data['status'], Sprint.Status.ACTIVE)

        complete = client.post(reverse(
            'project-complete-sprint',
            kwargs={'pk': self.project.id, 'sprint_id': sprint_id},
        ))
        self.assertEqual(complete.status_code, 200)
        self.assertEqual(complete.data['status'], Sprint.Status.COMPLETED)
        sprint_activity = Activity.objects.get(
            project=self.project,
            action=Activity.ActionTypes.SPRINT_COMPLETED,
        )
        self.assertEqual(sprint_activity.details['completion_percent'], 0)
        self.assertNotIn('actor', sprint_activity.details)

    def test_viewer_can_read_but_cannot_create_or_start_sprints(self):
        sprint = Sprint.objects.create(
            project=self.project,
            name='Iteration 1',
            start_date='2026-10-01',
            end_date='2026-10-14',
            created_by=self.manager,
        )
        client = APIClient()
        client.force_authenticate(self.viewer)

        self.assertEqual(client.get(
            reverse('project-sprints', kwargs={'pk': self.project.id})
        ).status_code, 200)
        self.assertEqual(client.post(
            reverse('project-sprints', kwargs={'pk': self.project.id}),
            {'name': 'Unauthorized', 'start_date': '2026-10-01', 'end_date': '2026-10-02'},
            format='json',
        ).status_code, 403)
        self.assertEqual(client.post(reverse(
            'project-start-sprint',
            kwargs={'pk': self.project.id, 'sprint_id': sprint.id},
        )).status_code, 403)

    def test_project_cannot_have_two_active_sprints(self):
        first = Sprint.objects.create(
            project=self.project, name='Active iteration',
            start_date='2026-10-01', end_date='2026-10-14',
            status=Sprint.Status.ACTIVE, created_by=self.manager,
        )
        client = APIClient()
        client.force_authenticate(self.manager)
        response = client.post(
            reverse('project-sprints', kwargs={'pk': self.project.id}),
            {
                'name': 'Second iteration',
                'start_date': '2026-10-15',
                'end_date': '2026-10-28',
            },
            format='json',
        )
        self.assertEqual(response.status_code, 201)
        second = Sprint.objects.get(pk=response.data['id'])
        second.status = Sprint.Status.ACTIVE
        with self.assertRaises(ValidationError):
            second.save()
        first.refresh_from_db()
        self.assertEqual(first.status, Sprint.Status.ACTIVE)
