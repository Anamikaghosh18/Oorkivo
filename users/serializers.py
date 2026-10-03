from rest_framework import serializers
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from organizations.models import OrganizationMembership
from organizations.permissions import membership_permissions
from teams.models import TeamMembership
from .models import User, UserPreferences


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = [
            "username",
            "email",
            "password",
            "first_name",
            "last_name",
        ]

    def create(self, validated_data):
        password = validated_data.pop("password")

        user = User.objects.create_user(
            password=password,
            **validated_data
        )

        return user


class UserSerializer(serializers.ModelSerializer):
    avatar_url = serializers.SerializerMethodField()
    organization_memberships = serializers.SerializerMethodField()
    current_organization = serializers.SerializerMethodField()

    def get_avatar_url(self, user):
        if not user.avatar:
            return None
        request = self.context.get('request')
        return request.build_absolute_uri(user.avatar.url) if request else user.avatar.url

    def get_organization_memberships(self, user):
        memberships = OrganizationMembership.objects.filter(
            user=user,
            is_active=True,
            status=OrganizationMembership.Status.ACTIVE,
        ).select_related('organization', 'organization__owner').order_by('joined_at', 'id')
        result = []
        for membership in memberships:
            team_names = TeamMembership.objects.filter(
                user=user, team__organization=membership.organization
            ).select_related('team').values_list('team__name', flat=True)
            result.append({
                'organization_id': membership.organization_id,
                'organization': membership.organization.name,
                'organization_description': membership.organization.description,
                'organization_plan': membership.organization.plan,
                'organization_logo_url': self._organization_logo_url(membership.organization),
                'access_level': membership.access_level,
                'status': membership.status,
                'job_title': membership.job_title or '',
                'teams': list(team_names),
                'permissions': membership_permissions(membership),
            })
        return result

    def _organization_logo_url(self, organization):
        if not organization.logo:
            return None
        request = self.context.get('request')
        return request.build_absolute_uri(organization.logo.url) if request else organization.logo.url

    def get_current_organization(self, user):
        memberships = self.get_organization_memberships(user)
        request = self.context.get('request')
        selected_id = request.headers.get('X-Organization-ID') if request else None
        current = next(
            (item for item in memberships if str(item['organization_id']) == str(selected_id)),
            memberships[0] if memberships else None,
        )
        if current is None:
            return None
        organization = OrganizationMembership.objects.select_related('organization').get(
            user=user, organization_id=current['organization_id'], is_active=True,
            status=OrganizationMembership.Status.ACTIVE,
        ).organization
        return {
            'id': organization.id,
            'name': organization.name,
            'description': organization.description,
            'logo_url': current['organization_logo_url'],
            'plan': organization.plan,
            'permissions': current['permissions'],
            'membership': {
                'role': current['access_level'],
                'status': current['status'],
            },
        }

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "timezone",
            "avatar_url",
            "organization_memberships",
            "current_organization",
        ]
        read_only_fields = [
            'id', 'username', 'email', 'avatar_url', 'organization_memberships',
            'current_organization',
        ]

    def validate_timezone(self, value):
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError, TypeError) as exc:
            raise serializers.ValidationError('Enter a valid IANA timezone, such as Europe/London.') from exc
        return value


class UserPreferencesSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserPreferences
        exclude = ['id', 'user']


class AvatarUploadSerializer(serializers.Serializer):
    avatar = serializers.FileField()

    def validate_avatar(self, file):
        if file.size > 5 * 1024 * 1024:
            raise serializers.ValidationError('Avatar image must be 5 MB or smaller.')
        signature = file.read(12)
        file.seek(0)
        image_signatures = (
            signature.startswith(b'\x89PNG\r\n\x1a\n'),
            signature.startswith(b'\xff\xd8\xff'),
            signature.startswith((b'GIF87a', b'GIF89a')),
            signature.startswith(b'RIFF') and signature[8:12] == b'WEBP',
        )
        if not any(image_signatures):
            raise serializers.ValidationError('Upload a valid PNG, JPEG, GIF, or WebP image.')
        return file