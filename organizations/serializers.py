from rest_framework import serializers
from .models import Organization, OrganizationInvitation, OrganizationMembership
from .permissions import membership_permissions
from users.models import User
from teams.models import TeamMembership

class UserMinimalSerializer(serializers.ModelSerializer):
    avatar_url = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'email', 'first_name', 'last_name', 'avatar_url']

    def get_avatar_url(self, user):
        if not user.avatar:
            return None
        request = self.context.get('request')
        return request.build_absolute_uri(user.avatar.url) if request else user.avatar.url

class OrganizationMembershipSerializer(serializers.ModelSerializer):
    user = UserMinimalSerializer(read_only=True)
    teams = serializers.SerializerMethodField()
    user_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), source='user', write_only=True
    )

    class Meta:
        model = OrganizationMembership
        fields = [
            'id', 'user', 'user_id', 'organization', 'access_level', 'status',
            'job_title', 'teams', 'is_active', 'joined_at',
        ]
        read_only_fields = ['organization', 'status', 'is_active', 'joined_at']

    def get_teams(self, membership):
        return list(TeamMembership.objects.filter(
            user=membership.user,
            team__organization=membership.organization,
        ).values_list('team__name', flat=True))

    def validate(self, attrs):
        organization = self.context.get('organization')
        user = attrs.get('user', getattr(self.instance, 'user', None))
        access_level = attrs.get('access_level', getattr(self.instance, 'access_level', None))
        if (
            organization
            and access_level == OrganizationMembership.AccessLevel.OWNER
            and user
            and organization.owner_id != user.id
        ):
            raise serializers.ValidationError({
                'access_level': 'Organization ownership is managed through the organization owner.'
            })
        return attrs

class OrganizationSerializer(serializers.ModelSerializer):
    logo = serializers.FileField(required=False, allow_null=True, write_only=True)
    logo_url = serializers.SerializerMethodField()
    permissions = serializers.SerializerMethodField()
    owner = UserMinimalSerializer(read_only=True)

    class Meta:
        model = Organization
        fields = [
            'id', 'name', 'description', 'logo', 'logo_url', 'owner', 'plan',
            'permissions', 'created_at',
        ]
        read_only_fields = ['owner', 'plan', 'permissions', 'created_at']

    def validate_logo(self, file):
        if file is None:
            return file
        if file.size > 5 * 1024 * 1024:
            raise serializers.ValidationError('Organization logo must be 5 MB or smaller.')
        signature = file.read(12)
        file.seek(0)
        valid_image = (
            signature.startswith(b'\x89PNG\r\n\x1a\n')
            or signature.startswith(b'\xff\xd8\xff')
            or signature.startswith((b'GIF87a', b'GIF89a'))
            or (signature.startswith(b'RIFF') and signature[8:12] == b'WEBP')
        )
        if not valid_image:
            raise serializers.ValidationError('Upload a valid PNG, JPEG, GIF, or WebP image.')
        return file

    def get_logo_url(self, organization):
        if not organization.logo:
            return None
        request = self.context.get('request')
        return request.build_absolute_uri(organization.logo.url) if request else organization.logo.url

    def get_permissions(self, organization):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if not user or not user.is_authenticated:
            return {}
        membership = OrganizationMembership.objects.filter(
            user=user,
            organization=organization,
            is_active=True,
            status=OrganizationMembership.Status.ACTIVE,
        ).first()
        if membership is None:
            return {}
        return membership_permissions(membership)


class OrganizationInvitationCreateSerializer(serializers.Serializer):
    email = serializers.EmailField(required=False, allow_blank=True)
    access_level = serializers.ChoiceField(
        choices=[
            OrganizationMembership.AccessLevel.ADMIN,
            OrganizationMembership.AccessLevel.MEMBER,
        ],
        default=OrganizationMembership.AccessLevel.MEMBER,
    )


class OrganizationInvitationSerializer(serializers.ModelSerializer):
    accept_url = serializers.SerializerMethodField()

    class Meta:
        model = OrganizationInvitation
        fields = [
            'id', 'email', 'invitation_code', 'access_level', 'token', 'status', 'expires_at',
            'created_at', 'accept_url',
        ]
        read_only_fields = fields

    def get_accept_url(self, invitation):
        return f'/invitations/accept?token={invitation.token}'