from rest_framework import serializers
from .models import Task, TaskAttachment, SavedTaskView
from organizations.serializers import UserMinimalSerializer
from users.models import User
from projects.models import Project, ProjectMembership, Sprint
from organizations.models import OrganizationMembership
from teams.models import TeamMembership

class MinimalProjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = Project
        fields = ['id', 'name']


class TaskSummarySerializer(serializers.ModelSerializer):
    sprint = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = Task
        fields = ['id', 'title', 'status', 'due_date', 'assigned_to', 'sprint']


class TaskSerializer(serializers.ModelSerializer):
    # Read-only nested fields
    created_by = UserMinimalSerializer(read_only=True)
    assigned_to_detail = UserMinimalSerializer(source='assigned_to', read_only=True)
    project_detail = MinimalProjectSerializer(source='project', read_only=True)
    
    # Write-only ID fields
    assigned_to = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), 
        required=False, 
        allow_null=True
    )
    parent_task_detail = TaskSummarySerializer(source='parent_task', read_only=True)
    subtasks = TaskSummarySerializer(many=True, read_only=True)
    dependencies = TaskSummarySerializer(many=True, read_only=True)
    dependents = TaskSummarySerializer(many=True, read_only=True)
    dependency_ids = serializers.PrimaryKeyRelatedField(
        source='dependencies',
        queryset=Task.objects.all(),
        many=True,
        required=False,
        write_only=True,
    )
    sprint_id = serializers.PrimaryKeyRelatedField(
        source='sprint',
        queryset=Sprint.objects.all(),
        required=False,
        allow_null=True,
        write_only=True,
    )
    project_id = serializers.PrimaryKeyRelatedField(
        source='project',
        queryset=Project.objects.all(),
        required=False,
        write_only=True,
    )
    sprint = serializers.SerializerMethodField()

    class Meta:
        model = Task
        fields = [
            'id', 'title', 'description', 'status', 'priority', 'due_date',
            'project', 'project_id', 'project_detail', 'created_by', 'assigned_to', 'assigned_to_detail',
            'parent_task', 'parent_task_detail', 'subtasks', 'dependencies',
            'dependents', 'dependency_ids', 'sprint', 'sprint_id', 'backlog_order',
            'estimated_hours', 'actual_hours', 'is_archived',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'project', 'created_by', 'is_archived', 'created_at', 'updated_at']

    def validate(self, attrs):
        request = self.context.get('request')
        if self.instance and request and self.instance.assigned_to_id == request.user.id:
            org_admin = OrganizationMembership.objects.filter(
                user=request.user,
                organization=self.instance.project.organization,
                access_level__in=[OrganizationMembership.AccessLevel.OWNER, OrganizationMembership.AccessLevel.ADMIN],
                is_active=True,
                status=OrganizationMembership.Status.ACTIVE,
            ).exists()
            manager = ProjectMembership.objects.filter(
                user=request.user, project=self.instance.project,
                role=ProjectMembership.ProjectRole.MANAGER,
            ).exists()
            if not (org_admin or manager) and 'assigned_to' in attrs:
                raise serializers.ValidationError({'assigned_to': 'Only project managers can reassign tasks.'})

        project = attrs.get('project') or getattr(self.instance, 'project', None) or self.context.get('project')
        if self.instance and project and project.organization_id != self.instance.project.organization_id:
            raise serializers.ValidationError({'project_id': 'Tasks can only be moved within the same organization.'})
        assignee = attrs.get('assigned_to', getattr(self.instance, 'assigned_to', None))
        assignment_changed = (
            self.instance is None
            or 'assigned_to' in attrs and assignee != self.instance.assigned_to
            or self.instance is not None and project and project.id != self.instance.project_id
        )
        if assignee and project and assignment_changed:
            is_active_member = OrganizationMembership.objects.filter(
                user=assignee,
                organization=project.organization,
                is_active=True,
                status=OrganizationMembership.Status.ACTIVE,
            ).exists()
            is_project_eligible = ProjectMembership.objects.filter(
                user=assignee,
                project=project,
                role__in=[
                    ProjectMembership.ProjectRole.MANAGER,
                    ProjectMembership.ProjectRole.CONTRIBUTOR,
                ],
            ).exists()
            is_team_eligible = project.team_id and TeamMembership.objects.filter(
                user=assignee, team_id=project.team_id
            ).exists()
            if not is_active_member:
                raise serializers.ValidationError({
                    'assigned_to': 'The assignee must be an active member of this project’s organization.'
                })
            if not (is_project_eligible or is_team_eligible):
                raise serializers.ValidationError({
                    'assigned_to': 'The assignee must be a member of this project or its team.'
                })
        parent = attrs.get('parent_task', getattr(self.instance, 'parent_task', None))
        dependencies = attrs.get('dependencies')

        if project and parent and parent.project_id != project.id:
            raise serializers.ValidationError({'parent_task': 'Parent task must belong to the same project.'})
        if self.instance and parent and parent.id == self.instance.id:
            raise serializers.ValidationError({'parent_task': 'A task cannot be its own parent.'})
        sprint = attrs.get('sprint', getattr(self.instance, 'sprint', None))
        if project and sprint and sprint.project_id != project.id:
            raise serializers.ValidationError({'sprint_id': 'Sprint must belong to the same project.'})
        if project and dependencies is not None:
            if any(task.project_id != project.id for task in dependencies):
                raise serializers.ValidationError({'dependency_ids': 'Dependencies must belong to the same project.'})
            if self.instance and any(task.id == self.instance.id for task in dependencies):
                raise serializers.ValidationError({'dependency_ids': 'A task cannot depend on itself.'})
            if self.instance:
                for dependency in dependencies:
                    seen = set()
                    pending = [dependency]
                    while pending:
                        current = pending.pop()
                        if current.id == self.instance.id:
                            raise serializers.ValidationError({'dependency_ids': 'Task dependencies cannot contain a cycle.'})
                        if current.id not in seen:
                            seen.add(current.id)
                            pending.extend(current.dependencies.all())
        if self.instance and project and project.id != self.instance.project_id:
            if (
                self.instance.parent_task_id
                or self.instance.subtasks.exists()
                or self.instance.dependencies.exists()
                or self.instance.dependents.exists()
                or self.instance.milestones.exists()
            ):
                raise serializers.ValidationError({
                    'project_id': 'Move this task only after removing its parent, subtasks, dependencies, and milestone links.'
                })
            if sprint and sprint.project_id != project.id:
                raise serializers.ValidationError({
                    'sprint_id': 'Choose a sprint in the new project or clear the current sprint.'
                })
        return attrs

    def get_sprint(self, task):
        if not task.sprint_id:
            return None
        return {'id': task.sprint_id, 'name': task.sprint.name, 'status': task.sprint.status}

    def to_representation(self, instance):
        rep = super().to_representation(instance)
        
        
        rep['assigned_to'] = rep.pop('assigned_to_detail', None)
        rep['project'] = rep.pop('project_detail', None)
        
        return rep


class TaskAttachmentSerializer(serializers.ModelSerializer):
    uploaded_by = UserMinimalSerializer(read_only=True)

    class Meta:
        model = TaskAttachment
        fields = ['id', 'task', 'uploaded_by', 'filename', 'file_size', 'content_type', 'created_at']
        read_only_fields = fields


class SavedTaskViewSerializer(serializers.ModelSerializer):
    class Meta:
        model = SavedTaskView
        fields = ['id', 'name', 'filters', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate_filters(self, value):
        allowed = {'status', 'priority', 'project', 'sprint', 'assignee', 'due_date', 'quick_view'}
        if not isinstance(value, dict) or set(value) - allowed:
            raise serializers.ValidationError('Filters may include status, priority, project, sprint, assignee, due_date, and quick_view.')
        for key in ('status', 'priority'):
            if key in value and not isinstance(value[key], list):
                raise serializers.ValidationError({key: 'Expected a list of values.'})
        if 'status' in value and any(item not in Task.Status.values for item in value['status']):
            raise serializers.ValidationError({'status': 'Contains an unsupported task status.'})
        if 'priority' in value and any(item not in Task.Priority.values for item in value['priority']):
            raise serializers.ValidationError({'priority': 'Contains an unsupported task priority.'})
        for key in ('project', 'sprint'):
            if key in value:
                try:
                    identifier = int(value[key]) if not isinstance(value[key], bool) else 0
                except (TypeError, ValueError) as exc:
                    raise serializers.ValidationError({key: 'Expected a positive identifier.'}) from exc
                if identifier < 1:
                    raise serializers.ValidationError({key: 'Expected a positive identifier.'})
        if 'assignee' in value and value['assignee'] != 'me':
            try:
                assignee_id = int(value['assignee']) if not isinstance(value['assignee'], bool) else 0
            except (TypeError, ValueError) as exc:
                raise serializers.ValidationError({'assignee': 'Use "me" or a user identifier.'}) from exc
            if assignee_id < 1:
                raise serializers.ValidationError({'assignee': 'Use "me" or a positive user identifier.'})
        if 'due_date' in value and value['due_date'] not in ('today', 'upcoming', 'overdue', 'none'):
            raise serializers.ValidationError({'due_date': 'Unsupported due date filter.'})
        quick_views = {
            'MY_TASKS', 'TODAY', 'UPCOMING', 'OVERDUE', 'HIGH_PRIORITY',
            'CURRENT_SPRINT', 'BLOCKED', 'ALL',
        }
        if 'quick_view' in value and (
            not isinstance(value['quick_view'], str) or value['quick_view'] not in quick_views
        ):
            raise serializers.ValidationError({'quick_view': 'Unsupported predefined task view.'})
        return value
