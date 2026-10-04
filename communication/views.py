from django.db.models import Q
from rest_framework import generics, viewsets, status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from django.shortcuts import get_object_or_404
from .models import TaskComment, ProjectComment, Notification, Activity
from .serializers import TaskCommentSerializer, ProjectCommentSerializer, NotificationSerializer
from .permissions import IsCommentAuthorOrModerator
from tasks.models import Task
from projects.models import Project
from tasks.permissions import HasTaskAccess
from .services import accessible_project_ids, create_due_reminders, create_notification, user_can_access_project
from organizations.context import active_organization_ids, current_organization_id

class TaskCommentListCreateView(generics.ListCreateAPIView):
    serializer_class = TaskCommentSerializer
    permission_classes = [IsAuthenticated]

    def check_task_access(self, task):
        # Instantiate the permission class manually to check access
        perm = HasTaskAccess()
        return perm.has_object_permission(self.request, self, task)

    def get_queryset(self):
        task = get_object_or_404(Task, id=self.kwargs['task_id'])
        if not self.check_task_access(task):
            return TaskComment.objects.none()
        return TaskComment.objects.filter(task=task).select_related('author').prefetch_related('mentions')

    def perform_create(self, serializer):
        task = get_object_or_404(Task, id=self.kwargs['task_id'])
        if not self.check_task_access(task):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You do not have access to this task.")

        mentions = serializer.validated_data.get('mentions', [])
        if any(not user_can_access_project(user, task.project) for user in mentions):
            raise ValidationError({'mentions': 'Mentioned users must have access to this project.'})
            
        comment = serializer.save(author=self.request.user, task=task)
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
        ).select_related('actor', 'task', 'project', 'sprint')

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
