from datetime import date, timedelta

from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient
from django.test import TestCase

from communication.models import Activity, Notification
from organizations.models import Organization, OrganizationMembership
from progress.models import PeerRecognition, UserAchievement, XPTransaction
from progress.services import (
    ACHIEVEMENTS,
    award_task_completion,
    calculate_streak,
    level_for_xp,
    member_progress,
    sync_achievements,
)
from projects.models import Project, ProjectMembership
from tasks.models import Task
from users.models import User


class ProgressServiceTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='progress-member', email='progress-member@example.com', password='password'
        )
        self.organization = Organization.objects.create(name='Progress workspace')
        OrganizationMembership.objects.create(user=self.user, organization=self.organization)
        self.project = Project.objects.create(
            organization=self.organization, name='Progress project'
        )
        ProjectMembership.objects.create(
            project=self.project,
            user=self.user,
            role=ProjectMembership.ProjectRole.CONTRIBUTOR,
        )

    def test_level_thresholds_and_progress_are_calculated_consistently(self):
        expected = [(0, 1), (99, 1), (100, 2), (250, 3), (500, 4), (850, 5)]

        for xp, level in expected:
            with self.subTest(xp=xp):
                self.assertEqual(level_for_xp(xp)['level'], level)

        self.assertEqual(level_for_xp(720)['xp_to_next_level'], 130)

    def test_task_rewards_are_idempotent_and_match_reward_rules(self):
        task = Task.objects.create(
            project=self.project,
            created_by=self.user,
            assigned_to=self.user,
            title='Deliver a high-priority task',
            priority=Task.Priority.HIGH,
            due_date=timezone.localdate(),
        )

        award_task_completion(task, self.user)
        award_task_completion(task, self.user)

        self.assertEqual(
            XPTransaction.objects.filter(user=self.user, organization=self.organization).count(),
            3,
        )
        self.assertEqual(
            sum(XPTransaction.objects.filter(user=self.user).values_list('amount', flat=True)),
            15,
        )

    def test_deadline_metrics_ignore_tasks_without_a_due_date(self):
        due_date = timezone.localdate() + timedelta(days=1)
        task = Task.objects.create(
            project=self.project,
            created_by=self.user,
            assigned_to=self.user,
            title='Dated task',
            status=Task.Status.COMPLETED,
            due_date=due_date,
        )
        Task.objects.create(
            project=self.project,
            created_by=self.user,
            assigned_to=self.user,
            title='Undated task',
            status=Task.Status.COMPLETED,
        )
        Activity.objects.create(
            project=self.project,
            task=task,
            actor=self.user,
            action=Activity.ActionTypes.COMPLETED,
        )

        summary = member_progress(self.user, self.organization)

        self.assertEqual(summary['stats']['completed_tasks'], 2)
        self.assertEqual(summary['stats']['on_time_percent'], 100)
        self.assertEqual(summary['achievements'][1]['progress'], 1)

    def test_achievement_awards_are_persisted_once(self):
        metrics = {
            'completed_tasks': 1,
            'early_bird': 0,
            'sprint_finisher': False,
            'streak': 0,
            'blocked_resolved': 0,
            'recognitions': 0,
            'sprints_completed': 0,
            'milestones_completed': 0,
            'on_time_tasks': 0,
            'projects_contributed': 0,
            'comments': 0,
        }

        sync_achievements(self.user, self.organization, metrics)
        sync_achievements(self.user, self.organization, metrics)

        self.assertEqual(UserAchievement.objects.filter(user=self.user).count(), 1)
        self.assertEqual(
            XPTransaction.objects.filter(
                user=self.user, reason='ACHIEVEMENT_UNLOCKED'
            ).count(),
            1,
        )
        self.assertEqual(ACHIEVEMENTS[0]['key'], 'FIRST_FINISHER')

    def test_streak_counts_consecutive_dates_and_allows_yesterday_as_latest_activity(self):
        today = date(2025, 4, 12)
        dates = {today - timedelta(days=1), today - timedelta(days=2), today - timedelta(days=3)}

        self.assertEqual(calculate_streak(dates, today), 3)
        self.assertEqual(calculate_streak({today - timedelta(days=2)}, today), 0)

    def test_progress_is_scoped_to_active_organization_membership(self):
        other_organization = Organization.objects.create(name='Other workspace')

        self.assertIsNotNone(member_progress(self.user, self.organization))
        self.assertIsNone(member_progress(self.user, other_organization))


class ProgressApiTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='api-member', email='api-member@example.com', password='password'
        )
        self.recipient = User.objects.create_user(
            username='api-recipient', email='api-recipient@example.com', password='password'
        )
        self.outside_user = User.objects.create_user(
            username='api-outsider', email='api-outsider@example.com', password='password'
        )
        self.organization = Organization.objects.create(name='API workspace')
        for user in (self.user, self.recipient):
            OrganizationMembership.objects.create(user=user, organization=self.organization)
        self.project = Project.objects.create(
            organization=self.organization, name='API project'
        )
        ProjectMembership.objects.create(
            project=self.project,
            user=self.user,
            role=ProjectMembership.ProjectRole.CONTRIBUTOR,
        )
        ProjectMembership.objects.create(
            project=self.project,
            user=self.recipient,
            role=ProjectMembership.ProjectRole.CONTRIBUTOR,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.client.credentials(HTTP_X_ORGANIZATION_ID=str(self.organization.id))

    def test_personal_progress_returns_summary_for_current_organization(self):
        response = self.client.get(reverse('my-progress'))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['profile']['id'], self.user.id)
        self.assertEqual(response.data['xp']['total'], 0)
        self.assertEqual(len(response.data['achievements']), len(ACHIEVEMENTS))
        self.assertFalse(response.data['can_view_team_progress'])

    def test_member_can_send_recognition_to_active_org_member(self):
        response = self.client.post(
            reverse('progress-recognitions'),
            {
                'recipient': self.recipient.id,
                'category': PeerRecognition.Category.TEAMWORK,
                'message': 'Thank you for unblocking the release.',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        self.assertTrue(PeerRecognition.objects.filter(
            giver=self.user, recipient=self.recipient, organization=self.organization
        ).exists())
        self.assertTrue(Notification.objects.filter(
            recipient=self.recipient,
            type=Notification.NotificationTypes.MEMBER_RECOGNIZED,
            organization=self.organization,
        ).exists())

    def test_completing_task_awards_xp_through_existing_task_endpoint(self):
        task = Task.objects.create(
            project=self.project,
            created_by=self.user,
            assigned_to=self.user,
            title='Complete through API',
        )

        response = self.client.patch(
            reverse('task-detail', kwargs={'pk': task.id}),
            {'status': Task.Status.COMPLETED},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        reward = XPTransaction.objects.get(
            user=self.user,
            organization=self.organization,
            reason='TASK_COMPLETED',
            source_id=task.id,
        )
        self.assertEqual(reward.amount, 5)

    def test_project_completion_threshold_creates_shared_celebration_activity(self):
        tasks = [
            Task.objects.create(
                project=self.project,
                created_by=self.user,
                assigned_to=self.user,
                title=f'Project task {index}',
            )
            for index in range(3)
        ]

        response = self.client.patch(
            reverse('task-detail', kwargs={'pk': tasks[0].id}),
            {'status': Task.Status.COMPLETED},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        celebration = Activity.objects.get(
            project=self.project,
            action=Activity.ActionTypes.PROJECT_UPDATED,
            details__celebration='PROJECT_PROGRESS',
        )
        self.assertEqual(celebration.details['completion_percent'], 25)

    def test_recognition_rejects_self_and_nonmember_recipients(self):
        self_response = self.client.post(
            reverse('progress-recognitions'),
            {'recipient': self.user.id, 'category': 'TEAMWORK', 'message': 'Thanks.'},
            format='json',
        )
        outsider_response = self.client.post(
            reverse('progress-recognitions'),
            {'recipient': self.outside_user.id, 'category': 'TEAMWORK', 'message': 'Thanks.'},
            format='json',
        )

        self.assertEqual(self_response.status_code, 400)
        self.assertEqual(outsider_response.status_code, 400)
        self.assertEqual(PeerRecognition.objects.count(), 0)

    def test_recognition_is_visible_only_to_its_giver_and_recipient(self):
        OrganizationMembership.objects.create(
            user=self.outside_user,
            organization=self.organization,
        )
        PeerRecognition.objects.create(
            organization=self.organization,
            giver=self.user,
            recipient=self.recipient,
            category=PeerRecognition.Category.TEAMWORK,
            message='Thank you for collaborating.',
        )

        self.client.force_authenticate(self.outside_user)
        response = self.client.get(reverse('progress-recognitions'))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, [])

    def test_regular_member_cannot_view_manager_overview(self):
        response = self.client.get(reverse('progress-overview'))

        self.assertEqual(response.status_code, 403)

    def test_admin_overview_contains_only_collective_progress(self):
        membership = OrganizationMembership.objects.get(
            user=self.user, organization=self.organization
        )
        membership.access_level = OrganizationMembership.AccessLevel.ADMIN
        membership.save(update_fields=['access_level'])

        response = self.client.get(reverse('progress-overview'))

        self.assertEqual(response.status_code, 200)
        personal_progress = self.client.get(reverse('my-progress'))
        self.assertTrue(personal_progress.data['can_view_team_progress'])
        self.assertEqual(len(response.data['projects']), 1)
        project = response.data['projects'][0]
        self.assertIn('completion_percent', project)
        self.assertNotIn('members', project)
        self.assertNotIn('assigned_completed_tasks', project)
        self.assertFalse({'members', 'member', 'xp', 'level', 'streak', 'achievements'} & set(response.data))

    def test_shared_celebrations_include_team_outcomes_but_no_actor_or_personal_metrics(self):
        Activity.objects.create(
            project=self.project,
            actor=self.user,
            action=Activity.ActionTypes.MILESTONE_COMPLETED,
            details={
                'milestone_id': 99,
                'milestone_title': 'Authentication & RBAC',
            },
        )

        response = self.client.get(reverse('progress-celebrations'))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data[0]['headline'], 'Project milestone unlocked')
        self.assertEqual(
            response.data[0]['message'],
            'Authentication & RBAC is complete.',
        )
        self.assertEqual(
            set(response.data[0]),
            {'id', 'kind', 'headline', 'message', 'project', 'created_at'},
        )
        self.assertNotIn(self.user.email, str(response.data))

    def test_celebrations_only_include_projects_the_member_can_access(self):
        other_project = Project.objects.create(
            organization=self.organization,
            name='Private project',
        )
        Activity.objects.create(
            project=other_project,
            actor=self.outside_user,
            action=Activity.ActionTypes.SPRINT_COMPLETED,
            details={'sprint_name': 'Private sprint', 'completion_percent': 100},
        )

        response = self.client.get(reverse('progress-celebrations'))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, [])

    def test_member_directory_is_limited_to_current_organization(self):
        response = self.client.get(reverse('progress-members'))

        self.assertEqual(response.status_code, 200)
        self.assertEqual({row['id'] for row in response.data}, {self.user.id, self.recipient.id})
