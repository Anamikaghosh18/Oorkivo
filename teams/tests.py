from django.test import TestCase
from rest_framework.test import APIClient

from communication.models import Activity, Notification
from organizations.models import Organization, OrganizationMembership
from projects.models import Project
from teams.models import Team, TeamMembership
from users.models import User


class TeamMembershipWorkflowTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username='team-owner', email='team-owner@example.com', password='password'
        )
        self.member = User.objects.create_user(
            username='team-member', email='team-member@example.com', password='password'
        )
        self.organization = Organization.objects.create(name='Team members', owner=self.owner)
        OrganizationMembership.objects.create(
            user=self.owner,
            organization=self.organization,
            access_level=OrganizationMembership.AccessLevel.OWNER,
        )
        self.member_organization_membership = OrganizationMembership.objects.create(
            user=self.member,
            organization=self.organization,
        )
        self.team = Team.objects.create(organization=self.organization, name='Engineering')
        self.project = Project.objects.create(
            organization=self.organization,
            team=self.team,
            name='Team project',
        )
        self.client = APIClient()
        self.client.force_authenticate(self.owner)
        self.client.credentials(HTTP_X_ORGANIZATION_ID=str(self.organization.id))

    def test_add_and_remove_team_member_preserves_organization_membership(self):
        response = self.client.post(
            f'/api/teams/{self.team.id}/members/',
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
            f'/api/teams/{self.team.id}/members/{membership_id}/'
        )

        self.assertEqual(removed.status_code, 204)
        self.assertFalse(TeamMembership.objects.filter(
            team=self.team, user=self.member
        ).exists())
        self.assertTrue(OrganizationMembership.objects.filter(
            pk=self.member_organization_membership.pk
        ).exists())
        self.assertTrue(Activity.objects.filter(
            project=self.project,
            actor=self.owner,
            action=Activity.ActionTypes.MEMBER_REMOVED,
        ).exists())

    def test_team_member_must_belong_to_its_organization(self):
        outside = User.objects.create_user(
            username='outside-team', email='outside-team@example.com', password='password'
        )
        response = self.client.post(
            f'/api/teams/{self.team.id}/members/',
            {'user_id': outside.id},
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn('user_id', response.data)
