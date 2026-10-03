from rest_framework import generics, viewsets, status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action
from django.shortcuts import get_object_or_404
from .models import TaskComment, ProjectComment, Notification, Activity
from .serializers import TaskCommentSerializer, ProjectCommentSerializer, NotificationSerializer
from .permissions import IsCommentAuthorOrModerator
from tasks.models import Task
from projects.models import Project
from tasks.permissions import HasTaskAccess

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
            
        comment = serializer.save(author=self.request.user, task=task)
        Activity.objects.create(
            project=task.project, task=task, actor=self.request.user,
            action=Activity.ActionTypes.COMMENTED,
            details={'comment_id': comment.id},
        )
        
        # Trigger notifications for mentions
        for user in comment.mentions.all():
            if user != self.request.user:
                Notification.objects.create(
                    recipient=user,
                    actor=self.request.user,
                    type=Notification.NotificationTypes.MENTION,
                    message=f"{self.request.user.first_name} mentioned you in a comment on '{task.title}'",
                    task=task,
                    project=task.project
                )

class TaskCommentDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = TaskComment.objects.all()
    serializer_class = TaskCommentSerializer
    permission_classes = [IsAuthenticated, IsCommentAuthorOrModerator]

class NotificationViewSet(viewsets.ModelViewSet):
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Notification.objects.filter(recipient=self.request.user)

    @action(detail=True, methods=['patch'])
    def read(self, request, pk=None):
        notif = self.get_object()
        notif.is_read = True
        notif.save()
        return Response({'status': 'read'})

    @action(detail=False, methods=['patch'], url_path='read-all')
    def read_all(self, request):
        self.get_queryset().update(is_read=True)
        return Response({'status': 'all read'})
