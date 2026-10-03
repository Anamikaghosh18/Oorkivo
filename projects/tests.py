from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from django.core.exceptions import ValidationError

from organizations.models import Organization, OrganizationMembership
from projects.models import Project, ProjectMembership, Sprint
from tasks.models import Task
from users.models import User


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
