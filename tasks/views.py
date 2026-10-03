from rest_framework import viewsets, mixins, status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from django.http import FileResponse
from django.utils.http import content_disposition_header
from pathlib import Path
import mimetypes
from .models import Task
from .models import TaskAttachment, SavedTaskView
from .serializers import TaskAttachmentSerializer, SavedTaskViewSerializer, TaskSerializer
from .permissions import HasTaskAccess
from communication.models import Activity
from communication.serializers import ActivitySerializer
from projects.models import Project
from projects.models import ProjectMembership
from organizations.models import OrganizationMembership
from projects.models import Sprint

MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024
ALLOWED_ATTACHMENT_TYPES = {
    '.pdf': {'application/pdf'},
    '.png': {'image/png'},
    '.jpg': {'image/jpeg'},
    '.jpeg': {'image/jpeg'},
    '.gif': {'image/gif'},
    '.webp': {'image/webp'},
    '.txt': {'text/plain'},
    '.csv': {'text/csv', 'application/vnd.ms-excel', 'text/plain'},
    '.doc': {'application/msword', 'application/octet-stream'},
    '.docx': {'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/zip'},
    '.xls': {'application/vnd.ms-excel', 'application/octet-stream'},
    '.xlsx': {'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/zip'},
    '.zip': {'application/zip', 'application/x-zip-compressed'},
}

class TaskViewSet(mixins.RetrieveModelMixin,
                  mixins.UpdateModelMixin,
                  mixins.DestroyModelMixin,
                  viewsets.GenericViewSet):
    """
    Handles GET, PATCH, DELETE for individual tasks: /api/tasks/{task_id}/
    """
    serializer_class = TaskSerializer
    permission_classes = [IsAuthenticated, HasTaskAccess]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_queryset(self):
       
        user = self.request.user
        org_ids = OrganizationMembership.objects.filter(
            user=user, is_active=True
        ).values_list('organization_id', flat=True)
        
        return Task.objects.filter(project__organization_id__in=org_ids).select_related(
            'created_by', 'assigned_to', 'project', 'project__organization'
        ).prefetch_related('subtasks', 'dependencies', 'dependents')
        
    def perform_update(self, serializer):
        task = serializer.instance
        before = {
            'status': task.status,
            'priority': task.priority,
            'assigned_to_id': task.assigned_to_id,
            'due_date': task.due_date,
            'sprint_id': task.sprint_id,
        }
        milestones = list(task.milestones.all()) if task.status != Task.Status.COMPLETED else []
        task._current_user = self.request.user
        updated = serializer.save()
        events = []
        if before['status'] != updated.status:
            events.append((Activity.ActionTypes.STATUS_CHANGED, {'old': before['status'], 'new': updated.status}))
            if updated.status == Task.Status.COMPLETED:
                events.append((Activity.ActionTypes.COMPLETED, {}))
        if before['priority'] != updated.priority:
            events.append((Activity.ActionTypes.PRIORITY_CHANGED, {'old': before['priority'], 'new': updated.priority}))
        if before['assigned_to_id'] != updated.assigned_to_id:
            events.append((Activity.ActionTypes.ASSIGNED, {
                'old': before['assigned_to_id'], 'new': updated.assigned_to_id,
            }))
        if before['due_date'] != updated.due_date:
            events.append((Activity.ActionTypes.DUE_DATE_CHANGED, {
                'old': str(before['due_date']) if before['due_date'] else None,
                'new': str(updated.due_date) if updated.due_date else None,
            }))
        if before['sprint_id'] != updated.sprint_id:
            events.append((Activity.ActionTypes.TASK_MOVED_TO_SPRINT, {
                'old_sprint_id': before['sprint_id'],
                'new_sprint_id': updated.sprint_id,
                'new_sprint_name': updated.sprint.name if updated.sprint_id else None,
            }))
        for action_type, details in events:
            Activity.objects.create(
                project=updated.project, task=updated, actor=self.request.user,
                action=action_type, details=details,
            )
        if before['status'] != Task.Status.COMPLETED and updated.status == Task.Status.COMPLETED:
            for milestone in milestones:
                milestone_tasks = list(milestone.tasks.all())
                if milestone_tasks and all(item.status == Task.Status.COMPLETED for item in milestone_tasks):
                    Activity.objects.create(
                        project=updated.project, task=updated, actor=self.request.user,
                        action=Activity.ActionTypes.MILESTONE_COMPLETED,
                        details={'milestone_id': milestone.id, 'milestone_title': milestone.title},
                    )

    @action(detail=True, methods=['get', 'post'])
    def subtasks(self, request, pk=None):
        parent = self.get_object()
        if request.method == 'GET':
            rows = parent.subtasks.select_related('assigned_to', 'created_by', 'project')
            return Response(TaskSerializer(rows, many=True).data)
        can_create = parent.assigned_to_id == request.user.id or self._has_management_rights(parent)
        if not can_create:
            return Response({'detail': 'Only the assignee or a project manager can add subtasks.'}, status=status.HTTP_403_FORBIDDEN)
        is_manager = self._has_management_rights(parent)
        requested_assignee = request.data.get('assigned_to')
        if not is_manager and requested_assignee not in (None, '', request.user.id, str(request.user.id)):
            return Response({'detail': 'Only project managers can assign subtasks to other members.'}, status=status.HTTP_403_FORBIDDEN)
        serializer = TaskSerializer(data=request.data, context={'project': parent.project})
        if serializer.is_valid():
            save_options = {'project': parent.project, 'created_by': request.user, 'parent_task': parent}
            if not is_manager:
                save_options['assigned_to'] = request.user
            subtask = serializer.save(**save_options)
            Activity.objects.create(
                project=parent.project, task=subtask, actor=request.user,
                action=Activity.ActionTypes.CREATED,
                details={'parent_task_id': parent.id, 'parent_task_title': parent.title},
            )
            return Response(TaskSerializer(subtask).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['get'])
    def activity(self, request, pk=None):
        task = self.get_object()
        rows = Activity.objects.filter(task=task).select_related('actor')
        return Response(ActivitySerializer(rows[:100], many=True).data)

    @action(detail=True, methods=['get', 'post'], url_path='attachments')
    def attachments(self, request, pk=None):
        task = self.get_object()
        if request.method == 'GET':
            attachments = task.attachments.select_related('uploaded_by').order_by('-created_at')
            return Response(TaskAttachmentSerializer(attachments, many=True).data)
        if not (task.assigned_to_id == request.user.id or self._has_management_rights(task)):
            return Response({'detail': 'Only the assignee or a project manager can upload attachments.'}, status=status.HTTP_403_FORBIDDEN)
        uploaded_file = request.FILES.get('file')
        if uploaded_file is None:
            return Response({'file': 'Choose a file to upload.'}, status=status.HTTP_400_BAD_REQUEST)
        extension = Path(uploaded_file.name).suffix.lower()
        allowed_types = ALLOWED_ATTACHMENT_TYPES.get(extension)
        content_type = uploaded_file.content_type or mimetypes.guess_type(uploaded_file.name)[0] or ''
        if not allowed_types or content_type not in allowed_types:
            return Response({'file': 'This file type is not allowed.'}, status=status.HTTP_400_BAD_REQUEST)
        if uploaded_file.size > MAX_ATTACHMENT_BYTES:
            return Response({'file': 'Attachments must be 20 MB or smaller.'}, status=status.HTTP_400_BAD_REQUEST)
        filename = Path(uploaded_file.name).name
        attachment = TaskAttachment.objects.create(
            task=task,
            uploaded_by=request.user,
            file=uploaded_file,
            filename=filename[:255],
            file_size=uploaded_file.size,
            content_type=content_type,
        )
        return Response(TaskAttachmentSerializer(attachment).data, status=status.HTTP_201_CREATED)

    @action(
        detail=True, methods=['get', 'delete'],
        url_path=r'attachments/(?P<attachment_id>\d+)',
    )
    def attachment_detail(self, request, pk=None, attachment_id=None):
        task = self.get_object()
        attachment = task.attachments.select_related('uploaded_by').filter(id=attachment_id).first()
        if attachment is None:
            return Response({'detail': 'Attachment not found.'}, status=status.HTTP_404_NOT_FOUND)
        if request.method == 'DELETE':
            if attachment.uploaded_by_id != request.user.id and not (
                task.assigned_to_id == request.user.id or self._has_management_rights(task)
            ):
                return Response({'detail': 'You cannot delete this attachment.'}, status=status.HTTP_403_FORBIDDEN)
            attachment.file.delete(save=False)
            attachment.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        attachment.file.open('rb')
        response = FileResponse(attachment.file, content_type=attachment.content_type)
        response['Content-Disposition'] = content_disposition_header(False, attachment.filename)
        response['X-Content-Type-Options'] = 'nosniff'
        return response

    def _has_management_rights(self, task):
        org_admin = OrganizationMembership.objects.filter(
            user=self.request.user,
            organization=task.project.organization,
            access_level__in=[OrganizationMembership.AccessLevel.OWNER, OrganizationMembership.AccessLevel.ADMIN],
            is_active=True,
        ).exists()
        project_manager = ProjectMembership.objects.filter(
            user=self.request.user, project=task.project,
            role=ProjectMembership.ProjectRole.MANAGER,
        ).exists()
        return org_admin or project_manager

    def perform_destroy(self, instance):
        instance._current_user = self.request.user
        instance.delete()


from rest_framework.views import APIView
from django.shortcuts import get_object_or_404
class ProjectTasksAPIView(APIView):
    permission_classes = [IsAuthenticated]
    
    def check_project_access(self, user, project):
        # 1. check org admin
        org = project.organization
        is_org_admin = OrganizationMembership.objects.filter(
            user=user, 
            organization=org, 
            access_level__in=[OrganizationMembership.AccessLevel.OWNER, OrganizationMembership.AccessLevel.ADMIN],
            is_active=True
        ).exists()
        if is_org_admin:
            return True
            
        # 2. check project member
        if ProjectMembership.objects.filter(user=user, project=project).exists():
            return True
            
        # 3. check team member
        if project.team and project.team.memberships.filter(user=user, is_active=True).exists():
            return True
            
        return False
        
    def check_project_management(self, user, project):
        is_org_admin = OrganizationMembership.objects.filter(
            user=user, 
            organization=project.organization, 
            access_level__in=[OrganizationMembership.AccessLevel.OWNER, OrganizationMembership.AccessLevel.ADMIN],
            is_active=True
        ).exists()
        if is_org_admin:
            return True
        return ProjectMembership.objects.filter(
            user=user, 
            project=project, 
            role=ProjectMembership.ProjectRole.MANAGER
        ).exists()

    def get(self, request, project_id):
        project = get_object_or_404(Project, id=project_id)
        
        # Check if user has access to view project tasks
        if not self.check_project_access(request.user, project):
            return Response({'detail': 'Not permitted.'}, status=status.HTTP_403_FORBIDDEN)
            
        tasks = Task.objects.filter(project=project).select_related(
            'created_by', 'assigned_to', 'project', 'sprint'
        )
        
        # Apply manual filtering since this is an APIView
        status_param = request.query_params.get('status')
        priority_param = request.query_params.get('priority')
        assigned_to_param = request.query_params.get('assigned_to')
        sprint_param = request.query_params.get('sprint')
        if request.query_params.get('backlog') == 'true':
            tasks = tasks.filter(sprint__isnull=True)
        elif sprint_param:
            tasks = tasks.filter(sprint_id=sprint_param)
        
        if status_param:
            tasks = tasks.filter(status=status_param)
        if priority_param:
            tasks = tasks.filter(priority=priority_param)
        if assigned_to_param:
            tasks = tasks.filter(assigned_to_id=assigned_to_param)
            
        serializer = TaskSerializer(tasks, many=True)
        return Response(serializer.data)

    def post(self, request, project_id):
        project = get_object_or_404(Project, id=project_id)
        
        
        if not self.check_project_management(request.user, project):
            return Response({'detail': 'You do not have permission to create tasks in this project.'}, status=status.HTTP_403_FORBIDDEN)
            
        serializer = TaskSerializer(data=request.data, context={'project': project, 'request': request})
        if serializer.is_valid():
            try:
                task = serializer.save(created_by=request.user, project=project)
                Activity.objects.create(
                    project=project, task=task, actor=request.user,
                    action=Activity.ActionTypes.CREATED,
                )
                return Response(serializer.data, status=status.HTTP_201_CREATED)
            except Exception as e:
                return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class SavedTaskViewSet(viewsets.ModelViewSet):
    serializer_class = SavedTaskViewSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def get_queryset(self):
        return SavedTaskView.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)
