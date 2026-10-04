from rest_framework import generics, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.exceptions import PermissionDenied, ValidationError
from django.db import transaction
from django.utils import timezone
from uuid import UUID
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView as JWTTokenRefreshView,
)

from organizations.models import OrganizationInvitation, OrganizationMembership
from .models import User
from .serializers import AvatarUploadSerializer, UserSerializer, UserPreferencesSerializer, RegisterSerializer
from .models import UserPreferences


class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]


class LoginView(TokenObtainPairView):
    permission_classes = [AllowAny]


class TokenRefreshView(JWTTokenRefreshView):
    permission_classes = [AllowAny]


class MeView(generics.RetrieveUpdateAPIView):
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        return self.request.user


class MeAvatarView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        serializer = AvatarUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = request.user
        previous_avatar = user.avatar.name if user.avatar else None
        user.avatar = serializer.validated_data['avatar']
        user.save(update_fields=['avatar'])
        if previous_avatar:
            user.avatar.storage.delete(previous_avatar)
        return Response(UserSerializer(user, context={'request': request}).data)

    def delete(self, request):
        user = request.user
        if user.avatar:
            user.avatar.delete(save=False)
            user.save(update_fields=['avatar'])
        return Response(status=status.HTTP_204_NO_CONTENT)


class MePreferencesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        preferences, _ = UserPreferences.objects.get_or_create(user=request.user)
        return Response(UserPreferencesSerializer(preferences).data)

    def patch(self, request):
        preferences, _ = UserPreferences.objects.get_or_create(user=request.user)
        serializer = UserPreferencesSerializer(preferences, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class AcceptOrganizationInvitationView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        token = request.data.get('token')
        code = request.data.get('code')
        if not token and not code:
            raise ValidationError({'code': 'An invitation code or link token is required.'})
        if token:
            try:
                token = UUID(str(token))
            except (TypeError, ValueError) as exc:
                raise ValidationError({'token': 'This invitation token is invalid.'}) from exc
        invitations = OrganizationInvitation.objects.filter(
            status=OrganizationInvitation.Status.PENDING
        )
        if token:
            invitations = invitations.filter(token=token)
        else:
            invitations = invitations.filter(invitation_code__iexact=str(code).strip())
        invitation = invitations.select_related('organization').first()
        if invitation is None:
            field = 'token' if token else 'code'
            raise ValidationError({field: 'This invitation is invalid or has already been used.'})
        if invitation.expires_at <= timezone.now():
            field = 'token' if token else 'code'
            raise ValidationError({field: 'This invitation has expired.'})
        if invitation.email and invitation.email.casefold() != request.user.email.casefold():
            raise PermissionDenied('Sign in with the email address this invitation was sent to.')

        with transaction.atomic():
            invitation = OrganizationInvitation.objects.select_for_update().get(pk=invitation.pk)
            if invitation.status != OrganizationInvitation.Status.PENDING:
                raise ValidationError({'code': 'This invitation has already been used.'})
            if invitation.expires_at <= timezone.now():
                raise ValidationError({'code': 'This invitation has expired.'})
            if invitation.email and invitation.email.casefold() != request.user.email.casefold():
                raise PermissionDenied('Sign in with the email address this invitation was sent to.')
            membership, created = OrganizationMembership.objects.get_or_create(
                user=request.user,
                organization=invitation.organization,
                defaults={
                    'access_level': invitation.access_level,
                    'is_active': True,
                    'status': OrganizationMembership.Status.ACTIVE,
                },
            )
            if not created:
                if membership.is_active and membership.status == OrganizationMembership.Status.ACTIVE:
                    raise ValidationError({'token': 'You are already a member of this organization.'})
                if membership.status != OrganizationMembership.Status.REMOVED:
                    raise ValidationError({'token': 'An existing inactive membership requires an administrator.'})
                membership.access_level = invitation.access_level
                membership.is_active = True
                membership.status = OrganizationMembership.Status.ACTIVE
                membership.save(update_fields=['access_level', 'is_active', 'status'])
            invitation.status = OrganizationInvitation.Status.ACCEPTED
            invitation.accepted_at = timezone.now()
            invitation.save(update_fields=['status', 'accepted_at'])

        return Response({
            'organization_id': invitation.organization_id,
            'organization_name': invitation.organization.name,
            'access_level': membership.access_level,
        })