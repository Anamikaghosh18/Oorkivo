from rest_framework import serializers
from django.contrib.auth import get_user_model

from organizations.models import OrganizationMembership
from .models import PeerRecognition


class PeerRecognitionSerializer(serializers.ModelSerializer):
    category = serializers.ChoiceField(choices=PeerRecognition.Category.choices)
    giver = serializers.SerializerMethodField()
    recipient = serializers.PrimaryKeyRelatedField(queryset=get_user_model().objects.all())
    recipient_name = serializers.SerializerMethodField()

    class Meta:
        model = PeerRecognition
        fields = ['id', 'giver', 'recipient', 'recipient_name', 'message', 'category', 'created_at']
        read_only_fields = ['id', 'giver', 'created_at']

    def get_giver(self, recognition):
        return recognition.giver.get_full_name() or recognition.giver.email

    def get_recipient_name(self, recognition):
        return recognition.recipient.get_full_name() or recognition.recipient.email

    def validate(self, attrs):
        request = self.context['request']
        organization = self.context['organization']
        recipient = attrs['recipient']
        if recipient == request.user:
            raise serializers.ValidationError({'recipient': 'You cannot recognize yourself.'})
        if not OrganizationMembership.objects.filter(
            user=recipient,
            organization=organization,
            is_active=True,
            status=OrganizationMembership.Status.ACTIVE,
        ).exists():
            raise serializers.ValidationError({
                'recipient': 'Choose an active member of this organization.'
            })
        return attrs

    def create(self, validated_data):
        validated_data['organization'] = self.context['organization']
        validated_data['giver'] = self.context['request'].user
        return super().create(validated_data)
