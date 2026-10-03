from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient
from datetime import timedelta

from organizations.models import Organization, OrganizationInvitation, OrganizationMembership
from projects.models import Project
from users.models import User


class OrganizationWorkspaceTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username='workspace-owner', email='owner@example.com', password='password'
        )
        self.member = User.objects.create_user(
            username='workspace-member', email='member@example.com', password='password'
        )
        self.client = APIClient()
        self.client.force_authenticate(self.owner)

    def test_workspace_creation_sets_owner_and_free_plan_and_exposes_membership(self):
        response = self.client.post(
            reverse('organization-list'), {'name': 'New workspace'}, format='json'
        )

        self.assertEqual(response.status_code, 201)
        organization = Organization.objects.get(pk=response.data['id'])
        membership = OrganizationMembership.objects.get(
            user=self.owner, organization=organization
        )
        self.assertEqual(organization.owner, self.owner)
        self.assertEqual(organization.plan, Organization.Plan.FREE)
        self.assertEqual(membership.access_level, OrganizationMembership.AccessLevel.OWNER)
        self.assertEqual(membership.status, OrganizationMembership.Status.ACTIVE)

        me = self.client.get(reverse('me'))
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.data['current_organization']['id'], organization.id)
        self.assertEqual(me.data['current_organization']['membership']['role'], 'OWNER')

    def test_one_user_can_have_memberships_in_multiple_organizations_with_different_roles(self):
        first = Organization.objects.create(name='First', owner=self.owner)
        second = Organization.objects.create(name='Second', owner=self.member, plan=Organization.Plan.PRO)
        OrganizationMembership.objects.create(
            user=self.owner,
            organization=first,
            access_level=OrganizationMembership.AccessLevel.OWNER,
        )
        OrganizationMembership.objects.create(
            user=self.owner,
            organization=second,
            access_level=OrganizationMembership.AccessLevel.MEMBER,
        )
        self.client.credentials(HTTP_X_ORGANIZATION_ID=str(second.id))

        response = self.client.get(reverse('me'))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['current_organization']['id'], second.id)
        self.assertEqual(response.data['current_organization']['plan'], Organization.Plan.PRO)
        self.assertEqual(response.data['current_organization']['membership']['role'], 'MEMBER')
        self.assertEqual(len(response.data['organization_memberships']), 2)

    def test_cross_organization_access_is_not_found(self):
        accessible = Organization.objects.create(name='Accessible', owner=self.owner)
        other_owner = User.objects.create_user(
            username='other-owner', email='other-owner@example.com', password='password'
        )
        inaccessible = Organization.objects.create(name='Private', owner=other_owner)
        OrganizationMembership.objects.create(
            user=self.owner,
            organization=accessible,
            access_level=OrganizationMembership.AccessLevel.OWNER,
        )
        self.client.credentials(HTTP_X_ORGANIZATION_ID=str(accessible.id))
        Project.objects.create(organization=inaccessible, name='Private project')

        response = self.client.get(
            f'/api/organizations/{inaccessible.id}/projects/'
        )

        self.assertEqual(response.status_code, 404)

    def test_owner_invites_user_and_invited_email_accepts_membership(self):
        organization = Organization.objects.create(name='Invitation workspace', owner=self.owner)
        OrganizationMembership.objects.create(
            user=self.owner,
            organization=organization,
            access_level=OrganizationMembership.AccessLevel.OWNER,
        )
        self.client.credentials(HTTP_X_ORGANIZATION_ID=str(organization.id))
        invitation_response = self.client.post(
            f'/api/organizations/{organization.id}/invitations/',
            {'email': self.member.email, 'access_level': 'MEMBER'},
            format='json',
        )

        self.assertEqual(invitation_response.status_code, 201)
        invitation = OrganizationInvitation.objects.get(pk=invitation_response.data['id'])
        self.assertEqual(invitation.status, OrganizationInvitation.Status.PENDING)

        invited_client = APIClient()
        invited_client.force_authenticate(self.member)
        accepted = invited_client.post(
            reverse('accept-organization-invitation'),
            {'token': str(invitation.token)},
            format='json',
        )

        self.assertEqual(accepted.status_code, 200)
        membership = OrganizationMembership.objects.get(user=self.member, organization=organization)
        self.assertEqual(membership.access_level, OrganizationMembership.AccessLevel.MEMBER)
        self.assertEqual(membership.status, OrganizationMembership.Status.ACTIVE)
        invitation.refresh_from_db()
        self.assertEqual(invitation.status, OrganizationInvitation.Status.ACCEPTED)

    def test_owner_creates_invitation_code_and_user_joins_with_assigned_role(self):
        organization = Organization.objects.create(name='Code workspace', owner=self.owner)
        OrganizationMembership.objects.create(
            user=self.owner,
            organization=organization,
            access_level=OrganizationMembership.AccessLevel.OWNER,
        )
        self.client.credentials(HTTP_X_ORGANIZATION_ID=str(organization.id))
        invite = self.client.post(
            f'/api/organizations/{organization.id}/invitations/',
            {'access_level': 'ADMIN'},
            format='json',
        )

        self.assertEqual(invite.status_code, 201)
        invitation = OrganizationInvitation.objects.get(pk=invite.data['id'])
        self.assertEqual(invite.data['invitation_code'], invitation.invitation_code)
        self.assertTrue(invitation.invitation_code.startswith('OK-'))
        self.assertEqual(invitation.email, '')

        joining_client = APIClient()
        joining_client.force_authenticate(self.member)
        accepted = joining_client.post(
            reverse('accept-organization-invitation'),
            {'code': invitation.invitation_code.lower()},
            format='json',
        )

        self.assertEqual(accepted.status_code, 200)
        self.assertEqual(accepted.data['organization_id'], organization.id)
        membership = OrganizationMembership.objects.get(
            user=self.member, organization=organization
        )
        self.assertEqual(membership.access_level, OrganizationMembership.AccessLevel.ADMIN)
        self.assertEqual(membership.status, OrganizationMembership.Status.ACTIVE)
        invitation.refresh_from_db()
        self.assertEqual(invitation.status, OrganizationInvitation.Status.ACCEPTED)
        self.assertIsNotNone(invitation.accepted_at)

        reused = joining_client.post(
            reverse('accept-organization-invitation'),
            {'code': invitation.invitation_code},
            format='json',
        )
        self.assertEqual(reused.status_code, 400)

    def test_invitation_code_rejects_expired_and_already_member_users(self):
        organization = Organization.objects.create(name='Expired workspace', owner=self.owner)
        OrganizationMembership.objects.create(
            user=self.owner,
            organization=organization,
            access_level=OrganizationMembership.AccessLevel.OWNER,
        )
        self.client.credentials(HTTP_X_ORGANIZATION_ID=str(organization.id))
        expired_invite = self.client.post(
            f'/api/organizations/{organization.id}/invitations/',
            {},
            format='json',
        )
        self.assertEqual(expired_invite.status_code, 201)
        expired = OrganizationInvitation.objects.get(pk=expired_invite.data['id'])
        expired.expires_at = timezone.now() - timedelta(seconds=1)
        expired.save(update_fields=['expires_at'])

        joining_client = APIClient()
        joining_client.force_authenticate(self.member)
        expired_response = joining_client.post(
            reverse('accept-organization-invitation'),
            {'code': expired.invitation_code},
            format='json',
        )
        self.assertEqual(expired_response.status_code, 400)
        self.assertFalse(
            OrganizationMembership.objects.filter(
                user=self.member, organization=organization
            ).exists()
        )

        active_invite = self.client.post(
            f'/api/organizations/{organization.id}/invitations/',
            {},
            format='json',
        )
        self.assertEqual(active_invite.status_code, 201)
        OrganizationMembership.objects.create(
            user=self.member,
            organization=organization,
            access_level=OrganizationMembership.AccessLevel.MEMBER,
        )
        already_member_response = joining_client.post(
            reverse('accept-organization-invitation'),
            {'code': active_invite.data['invitation_code']},
            format='json',
        )
        self.assertEqual(already_member_response.status_code, 400)
        active_invitation = OrganizationInvitation.objects.get(pk=active_invite.data['id'])
        self.assertEqual(active_invitation.status, OrganizationInvitation.Status.PENDING)
