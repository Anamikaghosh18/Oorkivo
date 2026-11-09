from django.db.models import Q
from django.db import transaction
from django.http import FileResponse
from django.utils import timezone
from django.utils.http import content_disposition_header
from pathlib import Path
import mimetypes
from rest_framework import generics, mixins, viewsets, status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from django.shortcuts import get_object_or_404
from .models import (
    Activity,
    ChatAttachment,
    ChatConversation,
    ChatMessage,
    ChatParticipant,
    Notification,
    ProjectComment,
    TaskComment,
    TaskCommentAttachment,
)
from .serializers import (
    ChatConversationSerializer,
    ChatMessageSerializer,
    NotificationSerializer,
    ProjectCommentSerializer,
    TaskCommentSerializer,
)
from .permissions import IsCommentAuthorOrModerator
from tasks.models import Task
from projects.models import Project
from tasks.permissions import HasTaskAccess
from .services import accessible_project_ids, create_due_reminders, create_notification, user_can_access_project
from organizations.context import active_organization_ids, current_organization_id
from organizations.models import Organization, OrganizationMembership
from teams.models import Team, TeamMembership

MAX_CHAT_ATTACHMENT_BYTES = 20 * 1024 * 1024
MAX_CHAT_ATTACHMENTS = 10
ALLOWED_CHAT_ATTACHMENT_TYPES = {
    '.pdf': {'application/pdf'},
    '.png': {'image/png'},
    '.jpg': {'image/jpeg'},
    '.jpeg': {'image/jpeg'},
    '.gif': {'image/gif'},
    '.webp': {'image/webp'},
    '.txt': {'text/plain'},
    '.csv': {'text/csv', 'application/vnd.ms-excel', 'text/plain'},
    '.doc': {'application/msword', 'application/octet-stream'},
    '.docx': {
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/zip',
    },
    '.xls': {'application/vnd.ms-excel', 'application/octet-stream'},
    '.xlsx': {
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/zip',
    },
    '.zip': {'application/zip', 'application/x-zip-compressed'},
}

class TaskCommentListCreateView(generics.ListCreateAPIView):
    serializer_class = TaskCommentSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def check_task_access(self, task):
        # Instantiate the permission class manually to check access
        perm = HasTaskAccess()
        return perm.has_object_permission(self.request, self, task)

    def get_queryset(self):
        task = get_object_or_404(Task, id=self.kwargs['task_id'])
        if not self.check_task_access(task):
            return TaskComment.objects.none()
        return TaskComment.objects.filter(task=task).select_related('author').prefetch_related(
            'mentions', 'attachments'
        )

    def perform_create(self, serializer):
        task = get_object_or_404(Task, id=self.kwargs['task_id'])
        if not self.check_task_access(task):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You do not have access to this task.")

        mentions = serializer.validated_data.get('mentions', [])
        if any(not user_can_access_project(user, task.project) for user in mentions):
            raise ValidationError({'mentions': 'Mentioned users must have access to this project.'})

        uploaded_files = self.request.FILES.getlist('files')
        if not serializer.validated_data.get('content', '').strip() and not uploaded_files:
            raise ValidationError({'content': 'Write a comment or attach a file.'})
        if len(uploaded_files) > MAX_CHAT_ATTACHMENTS:
            raise ValidationError({'files': 'Attach up to 10 files per comment.'})
        checked_files = []
        for uploaded_file in uploaded_files:
            extension = Path(uploaded_file.name).suffix.lower()
            content_type = uploaded_file.content_type or mimetypes.guess_type(uploaded_file.name)[0] or ''
            allowed_types = ALLOWED_CHAT_ATTACHMENT_TYPES.get(extension)
            if not allowed_types or content_type not in allowed_types:
                raise ValidationError({'files': f'{uploaded_file.name} is not an allowed file type.'})
            if uploaded_file.size > MAX_CHAT_ATTACHMENT_BYTES:
                raise ValidationError({'files': 'Attachments must be 20 MB or smaller.'})
            checked_files.append((uploaded_file, Path(uploaded_file.name).name[:255], content_type))

        with transaction.atomic():
            comment = serializer.save(author=self.request.user, task=task)
            for uploaded_file, filename, content_type in checked_files:
                TaskCommentAttachment.objects.create(
                    comment=comment,
                    file=uploaded_file,
                    filename=filename,
                    file_size=uploaded_file.size,
                    content_type=content_type,
                )
        Activity.objects.create(
            project=task.project, task=task, actor=self.request.user,
            action=Activity.ActionTypes.COMMENTED,
            details={'comment_id': comment.id},
        )
        
        # Trigger notifications for mentions
        for user in comment.mentions.all():
            if user != self.request.user:
                create_notification(
                    recipient=user,
                    actor=self.request.user,
                    kind=Notification.NotificationTypes.TASK_MENTIONED,
                    title='You were mentioned in a task',
                    message=f"{self.request.user.first_name or self.request.user.email} mentioned you in '{task.title}'.",
                    task=task,
                    project=task.project,
                )
        assignee = task.assigned_to
        if assignee and assignee != self.request.user and assignee not in comment.mentions.all():
            create_notification(
                recipient=assignee,
                actor=self.request.user,
                kind=Notification.NotificationTypes.TASK_COMMENTED,
                title='New comment on your task',
                message=f'{self.request.user.first_name or self.request.user.email} commented on "{task.title}".',
                task=task,
                project=task.project,
            )


class TaskCommentAttachmentDownloadView(generics.RetrieveAPIView):
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return TaskCommentAttachment.objects.filter(
            comment__task__project_id__in=accessible_project_ids(
                self.request.user, current_organization_id(self.request)
            )
        ).select_related('comment', 'comment__task', 'comment__task__project')

    def retrieve(self, request, *args, **kwargs):
        attachment = self.get_object()
        if not HasTaskAccess().has_object_permission(
            request, self, attachment.comment.task
        ):
            raise NotFound('Attachment not found.')
        attachment.file.open('rb')
        response = FileResponse(attachment.file, content_type=attachment.content_type)
        response['Content-Disposition'] = content_disposition_header(False, attachment.filename)
        response['X-Content-Type-Options'] = 'nosniff'
        return response

class TaskCommentDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = TaskCommentSerializer
    permission_classes = [IsAuthenticated, IsCommentAuthorOrModerator]

    def get_queryset(self):
        return TaskComment.objects.filter(
            task__project_id__in=accessible_project_ids(
                self.request.user, current_organization_id(self.request)
            )
        ).select_related('task', 'task__project', 'author').prefetch_related('mentions')

    def perform_update(self, serializer):
        mentions = serializer.validated_data.get('mentions')
        if mentions is not None and any(
            not user_can_access_project(user, serializer.instance.task.project)
            for user in mentions
        ):
            raise ValidationError({'mentions': 'Mentioned users must have access to this project.'})
        serializer.save()

class NotificationViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        project_ids = accessible_project_ids(
            self.request.user, current_organization_id(self.request)
        )
        return Notification.objects.filter(recipient=self.request.user).filter(
            Q(task__project_id__in=project_ids)
            | Q(project_id__in=project_ids)
            | Q(sprint__project_id__in=project_ids)
            | Q(organization_id__in=active_organization_ids(self.request.user))
        ).select_related('actor', 'task', 'project', 'sprint', 'conversation')

    def list(self, request, *args, **kwargs):
        create_due_reminders(request.user, current_organization_id(request))
        return super().list(request, *args, **kwargs)

    @action(detail=True, methods=['patch'])
    def read(self, request, pk=None):
        notification = self.get_object()
        notification.is_read = True
        notification.save(update_fields=['is_read'])
        return Response({'status': 'read'})

    @action(detail=False, methods=['patch'], url_path='read-all')
    def read_all(self, request):
        self.get_queryset().update(is_read=True)
        return Response({'status': 'all read'})


class ChatConversationViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = ChatConversationSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_queryset(self):
        queryset = ChatConversation.objects.filter(
            organization_id__in=active_organization_ids(self.request.user),
            members=self.request.user,
        ).distinct().select_related('project', 'team').prefetch_related('members')
        organization_id = current_organization_id(self.request)
        if organization_id is not None:
            queryset = queryset.filter(organization_id=organization_id)
        return queryset

    def create(self, request, *args, **kwargs):
        organization_id = current_organization_id(request)
        if organization_id is None:
            raise ValidationError({'organization': 'Choose a workspace before starting a chat.'})
        organization = Organization.objects.filter(
            pk=organization_id,
            memberships__user=request.user,
            memberships__is_active=True,
            memberships__status=OrganizationMembership.Status.ACTIVE,
        ).first()
        if organization is None:
            raise NotFound('Workspace not found.')

        project_id = request.data.get('project_id')
        team_id = request.data.get('team_id')
        if project_id and team_id:
            raise ValidationError({'context': 'Choose a project or a team, not both.'})
        project = None
        team = None
        if project_id:
            try:
                project_id = int(project_id)
            except (TypeError, ValueError):
                raise ValidationError({'project_id': 'Choose a valid project.'})
            project = Project.objects.filter(
                pk=project_id,
                organization=organization,
                is_archived=False,
            ).first()
            if project is None:
                raise ValidationError({'project_id': 'Choose an active project in this workspace.'})
            if not user_can_access_project(request.user, project):
                raise PermissionDenied('You do not have access to this project chat.')
        if team_id:
            try:
                team_id = int(team_id)
            except (TypeError, ValueError):
                raise ValidationError({'team_id': 'Choose a valid team.'})
            team = Team.objects.filter(
                pk=team_id,
                organization=organization,
                is_archived=False,
            ).first()
            if team is None:
                raise ValidationError({'team_id': 'Choose an active team in this workspace.'})
            is_org_admin = OrganizationMembership.objects.filter(
                organization=organization,
                user=request.user,
                is_active=True,
                status=OrganizationMembership.Status.ACTIVE,
                access_level__in=[
                    OrganizationMembership.AccessLevel.OWNER,
                    OrganizationMembership.AccessLevel.ADMIN,
                ],
            ).exists()
            if not is_org_admin and not TeamMembership.objects.filter(
                team=team, user=request.user
            ).exists():
                raise PermissionDenied('You do not have access to this team chat.')

        member_ids = request.data.get('member_ids', [])
        if not isinstance(member_ids, list):
            member_ids = [member_ids]
        try:
            member_ids = {int(member_id) for member_id in member_ids}
        except (TypeError, ValueError):
            raise ValidationError({'member_ids': 'Choose valid workspace members.'})
        member_ids.discard(request.user.id)
        if not member_ids:
            raise ValidationError({'member_ids': 'Choose at least one other person.'})
        if len(member_ids) > 49:
            raise ValidationError({'member_ids': 'A chat can have up to 50 participants.'})

        active_member_ids = set(OrganizationMembership.objects.filter(
            organization=organization,
            user_id__in=member_ids,
            is_active=True,
            status=OrganizationMembership.Status.ACTIVE,
        ).values_list('user_id', flat=True))
        if active_member_ids != member_ids:
            raise ValidationError({'member_ids': 'All participants must be active workspace members.'})

        participant_ids = member_ids | {request.user.id}
        if project:
            participant_memberships = OrganizationMembership.objects.filter(
                organization=organization,
                user_id__in=participant_ids,
                is_active=True,
                status=OrganizationMembership.Status.ACTIVE,
            ).select_related('user')
            if any(
                not user_can_access_project(membership.user, project)
                for membership in participant_memberships
            ):
                raise ValidationError({
                    'member_ids': 'Project chats can only include people who have access to the project.'
                })
        if team:
            team_member_ids = set(TeamMembership.objects.filter(
                team=team,
                user_id__in=participant_ids,
            ).values_list('user_id', flat=True))
            org_admin_ids = set(OrganizationMembership.objects.filter(
                organization=organization,
                user_id__in=participant_ids,
                is_active=True,
                status=OrganizationMembership.Status.ACTIVE,
                access_level__in=[
                    OrganizationMembership.AccessLevel.OWNER,
                    OrganizationMembership.AccessLevel.ADMIN,
                ],
            ).values_list('user_id', flat=True))
            if not participant_ids.issubset(team_member_ids | org_admin_ids):
                raise ValidationError({
                    'member_ids': 'Team chats can only include team members and workspace admins.'
                })
        is_group = len(member_ids) > 1
        title = str(request.data.get('title', '')).strip()[:120]
        if not is_group:
            other_id = next(iter(member_ids))
            candidates = ChatConversation.objects.filter(
                organization=organization,
                is_group=False,
                project=project,
                team=team,
                members=request.user,
            ).filter(members__id=other_id).distinct()
            for candidate in candidates:
                if set(candidate.members.values_list('id', flat=True)) == participant_ids:
                    return Response(
                        self.get_serializer(candidate).data,
                        status=status.HTTP_200_OK,
                    )

        with transaction.atomic():
            conversation = ChatConversation.objects.create(
                organization=organization,
                created_by=request.user,
                project=project,
                team=team,
                title=title if is_group else '',
                is_group=is_group,
            )
            ChatParticipant.objects.bulk_create([
                ChatParticipant(conversation=conversation, user_id=user_id)
                for user_id in participant_ids
            ])
        return Response(
            self.get_serializer(conversation).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=['get', 'post'], url_path='messages')
    def messages(self, request, pk=None):
        conversation = self.get_object()
        participant = get_object_or_404(
            ChatParticipant, conversation=conversation, user=request.user
        )

        if request.method == 'GET':
            messages = conversation.messages.select_related('sender').prefetch_related(
                'mentions', 'attachments'
            )
            participant.last_read_at = timezone.now()
            participant.save(update_fields=['last_read_at'])
            return Response(ChatMessageSerializer(
                messages, many=True, context=self.get_serializer_context()
            ).data)

        content = str(request.data.get('content', '')).strip()
        uploaded_files = request.FILES.getlist('files')
        if not content and not uploaded_files:
            raise ValidationError({'content': 'Write a message or attach a file.'})
        if len(uploaded_files) > MAX_CHAT_ATTACHMENTS:
            raise ValidationError({'files': 'Attach up to 10 files per message.'})
        for uploaded_file in uploaded_files:
            extension = Path(uploaded_file.name).suffix.lower()
            content_type = uploaded_file.content_type or mimetypes.guess_type(uploaded_file.name)[0] or ''
            allowed_types = ALLOWED_CHAT_ATTACHMENT_TYPES.get(extension)
            if not allowed_types or content_type not in allowed_types:
                raise ValidationError({'files': f'{uploaded_file.name} is not an allowed file type.'})
            if uploaded_file.size > MAX_CHAT_ATTACHMENT_BYTES:
                raise ValidationError({'files': 'Attachments must be 20 MB or smaller.'})

        raw_mentions = request.data.getlist('mentions') if hasattr(request.data, 'getlist') else request.data.get('mentions', [])
        if raw_mentions is None:
            raw_mentions = []
        if not isinstance(raw_mentions, (list, tuple, set)):
            raw_mentions = [raw_mentions]
        try:
            mention_ids = {int(user_id) for user_id in raw_mentions}
        except (TypeError, ValueError):
            raise ValidationError({'mentions': 'Choose valid chat participants.'})
        allowed_mentions = set(ChatParticipant.objects.filter(
            conversation=conversation,
            user_id__in=mention_ids,
        ).values_list('user_id', flat=True))
        if allowed_mentions != mention_ids:
            raise ValidationError({'mentions': 'Only chat participants can be mentioned.'})

        with transaction.atomic():
            message = ChatMessage.objects.create(
                conversation=conversation,
                sender=request.user,
                content=content,
            )
            message.mentions.set(mention_ids)
            for uploaded_file in uploaded_files:
                filename = Path(uploaded_file.name).name[:255]
                content_type = uploaded_file.content_type or mimetypes.guess_type(filename)[0] or 'application/octet-stream'
                ChatAttachment.objects.create(
                    message=message,
                    file=uploaded_file,
                    filename=filename,
                    file_size=uploaded_file.size,
                    content_type=content_type,
                )
            conversation.updated_at = timezone.now()
            conversation.save(update_fields=['updated_at'])
            participant.last_read_at = timezone.now()
            participant.save(update_fields=['last_read_at'])
            for mentioned_user in OrganizationMembership.objects.filter(
                organization=conversation.organization,
                user_id__in=mention_ids,
                is_active=True,
                status=OrganizationMembership.Status.ACTIVE,
            ).select_related('user'):
                if mentioned_user.user_id == request.user.id:
                    continue
                Notification.objects.create(
                    recipient=mentioned_user.user,
                    actor=request.user,
                    type=Notification.NotificationTypes.CHAT_MENTIONED,
                    title='You were mentioned in chat',
                    message=f'{request.user.get_full_name() or request.user.email} mentioned you in a conversation.',
                    organization=conversation.organization,
                    conversation=conversation,
                )

        return Response(
            ChatMessageSerializer(message, context=self.get_serializer_context()).data,
            status=status.HTTP_201_CREATED,
        )

    @action(
        detail=True,
        methods=['get'],
        url_path=r'attachments/(?P<attachment_id>\d+)',
    )
    def attachment(self, request, pk=None, attachment_id=None):
        conversation = self.get_object()
        attachment = ChatAttachment.objects.filter(
            id=attachment_id,
            message__conversation=conversation,
        ).first()
        if attachment is None:
            raise NotFound('Attachment not found.')
        attachment.file.open('rb')
        response = FileResponse(attachment.file, content_type=attachment.content_type)
        response['Content-Disposition'] = content_disposition_header(False, attachment.filename)
        response['X-Content-Type-Options'] = 'nosniff'
        return response
