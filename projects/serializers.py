from rest_framework import serializers
from .models import Project, ProjectMembership, ProjectMilestone, Sprint
from organizations.serializers import UserMinimalSerializer
from users.models import User
from tasks.models import Task

class ProjectMembershipSerializer(serializers.ModelSerializer):
    user = UserMinimalSerializer(read_only=True)
    user_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), source='user', write_only=True
    )

    class Meta:
        model = ProjectMembership
        fields = ['id', 'user', 'user_id', 'project', 'role', 'joined_at']
        read_only_fields = ['project', 'joined_at']

class ProjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = Project
        fields = [
            'id', 'organization', 'team', 'name', 'description', 
            'status', 'start_date', 'target_end_date', 'actual_end_date', 
            'created_at', 'updated_at'
        ]
        read_only_fields = ['organization', 'created_at', 'updated_at']


class ProjectMilestoneSerializer(serializers.ModelSerializer):
    tasks = serializers.PrimaryKeyRelatedField(queryset=Task.objects.all(), many=True, required=False)
    completion = serializers.SerializerMethodField()

    class Meta:
        model = ProjectMilestone
        fields = ['id', 'project', 'title', 'description', 'target_date', 'tasks', 'completion', 'created_at', 'updated_at']
        read_only_fields = ['id', 'project', 'completion', 'created_at', 'updated_at']

    def validate_tasks(self, tasks):
        project = getattr(self.instance, 'project', None) or self.context.get('project')
        if project and any(task.project_id != project.id for task in tasks):
            raise serializers.ValidationError('Milestone tasks must belong to the same project.')
        return tasks

    def get_completion(self, milestone):
        task_list = list(milestone.tasks.all())
        if not task_list:
            return 0
        return round(sum(task.status == Task.Status.COMPLETED for task in task_list) / len(task_list) * 100)


class SprintSerializer(serializers.ModelSerializer):
    total_tasks = serializers.SerializerMethodField()
    completed_tasks = serializers.SerializerMethodField()
    blocked_tasks = serializers.SerializerMethodField()
    remaining_tasks = serializers.SerializerMethodField()
    progress = serializers.SerializerMethodField()
    created_by = UserMinimalSerializer(read_only=True)

    class Meta:
        model = Sprint
        fields = [
            'id', 'project', 'name', 'goal', 'start_date', 'end_date', 'status',
            'created_by', 'total_tasks', 'completed_tasks', 'remaining_tasks',
            'blocked_tasks', 'progress', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'project', 'status', 'created_by', 'created_at', 'updated_at']

    def validate(self, attrs):
        start = attrs.get('start_date', getattr(self.instance, 'start_date', None))
        end = attrs.get('end_date', getattr(self.instance, 'end_date', None))
        if start and end and end < start:
            raise serializers.ValidationError({'end_date': 'Sprint end date must be on or after its start date.'})
        return attrs

    def _tasks(self, sprint):
        return sprint.tasks.all()

    def get_total_tasks(self, sprint):
        return self._tasks(sprint).count()

    def get_completed_tasks(self, sprint):
        return self._tasks(sprint).filter(status=Task.Status.COMPLETED).count()

    def get_remaining_tasks(self, sprint):
        return self._tasks(sprint).exclude(status=Task.Status.COMPLETED).count()

    def get_blocked_tasks(self, sprint):
        return self._tasks(sprint).filter(status=Task.Status.BLOCKED).count()

    def get_progress(self, sprint):
        total = self.get_total_tasks(sprint)
        return round(self.get_completed_tasks(sprint) / total * 100) if total else 0
