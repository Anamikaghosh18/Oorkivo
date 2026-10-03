from django.test import TestCase
from django.test import override_settings
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from rest_framework.test import APIClient
from tempfile import TemporaryDirectory

from users.models import User, UserPreferences


class AccountSettingsApiTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='settings-user', email='settings@example.com', password='password'
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_profile_update_validates_timezone(self):
        response = self.client.patch(
            reverse('me'),
            {'first_name': 'Priya', 'timezone': 'America/Los_Angeles'},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['first_name'], 'Priya')
        self.assertEqual(response.data['timezone'], 'America/Los_Angeles')

        invalid = self.client.patch(
            reverse('me'), {'timezone': 'Not/A_Timezone'}, format='json'
        )
        self.assertEqual(invalid.status_code, 400)

    def test_preferences_are_persisted_per_user(self):
        response = self.client.patch(
            reverse('me-preferences'),
            {'theme': UserPreferences.Theme.DARK, 'task_assignments': False},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['theme'], UserPreferences.Theme.DARK)
        preferences = UserPreferences.objects.get(user=self.user)
        self.assertFalse(preferences.task_assignments)
        self.assertTrue(preferences.task_comments)

    def test_avatar_upload_and_removal(self):
        with TemporaryDirectory() as media_dir, override_settings(MEDIA_ROOT=media_dir):
            upload = SimpleUploadedFile(
                'avatar.png', b'\x89PNG\r\n\x1a\nimage-data', content_type='image/png'
            )
            uploaded = self.client.post(
                reverse('me-avatar'), {'avatar': upload}, format='multipart'
            )
            self.assertEqual(uploaded.status_code, 200)
            self.assertTrue(uploaded.data['avatar_url'].endswith('.png'))

            removed = self.client.delete(reverse('me-avatar'))
            self.assertEqual(removed.status_code, 204)
            self.user.refresh_from_db()
            self.assertFalse(self.user.avatar)
