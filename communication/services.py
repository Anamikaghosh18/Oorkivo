from django.db.models import Q

from organizations.models import OrganizationMembership
from projects.models import Project, ProjectMembership, Sprint
from tasks.models import Task
from teams.models import TeamMembership
from organizations.context import active_organization_ids

from .models import Notification

PREFERENCE_FOR_TYPE = {
    Notification.NotificationTypes.TASK_ASSIGNED: 'task_assignments',
    Notification.NotificationTypes.ASSIGNMENT: 'task_assignments',
    Notification.NotificationTypes.TASK_STATUS_CHANGED: 'task_status_changes',
    Notification.NotificationTypes.TASK_COMMENTED: 'task_comments',
    Notification.NotificationTypes.TASK_MENTIONED: 'task_mentions',
    Notification.NotificationTypes.MENTION: 'task_mentions',
    Notification.NotificationTypes.PROJECT_UPDATED: 'project_updates',
    Notification.NotificationTypes.SPRINT_STARTED: 'sprint_started',
    Notification.NotificationTypes.SPRINT_ENDING: 'sprint_ending_soon',
    Notification.NotificationTypes.MILESTONE_UPDATED: 'milestone_updates',
    Notification.NotificationTypes.TASK_DUE: 'due_date_reminders',
    Notification.NotificationTypes.TASK_OVERDUE: 'overdue_task_reminders',
}


def accessible_project_ids(user, organization_id=None):
    admin_org_ids = OrganizationMembership.objects.filter(
        user=user,
        is_active=True,
        access_level__in=[
            OrganizationMembership.AccessLevel.OWNER,
            OrganizationMembership.AccessLevel.ADMIN,
        ],
    ).values_list('organization_id', flat=True)
    projects = Project.objects.filter(
        organization_id__in=active_organization_ids(user)
    ).filter(
        Q(organization_id__in=admin_org_ids)
        | Q(memberships__user=user)
        | Q(team__memberships__user=user)
    )
    if organization_id is not None:
        projects = projects.filter(organization_id=organization_id)
    return projects.values_list('id', flat=True).distinct()


def user_can_access_project(user, project):
    if not OrganizationMembership.objects.filter(
        user=user,
        organization_id=project.organization_id,
        is_active=True,
        status=OrganizationMembership.Status.ACTIVE,
    ).exists():
        return False
    return (
        OrganizationMembership.objects.filter(
            user=user,
            organization_id=project.organization_id,
            access_level__in=[
                OrganizationMembership.AccessLevel.OWNER,
                OrganizationMembership.AccessLevel.ADMIN,
            ],
            is_active=True,
            status=OrganizationMembership.Status.ACTIVE,
        ).exists()
        or ProjectMembership.objects.filter(user=user, project=project).exists()
        or TeamMembership.objects.filter(user=user, team_id=project.team_id).exists()
    )


def create_notification(*, recipient, kind, title, message, actor=None,
                        task=None, project=None, sprint=None, dedupe_key=None):
    if actor and recipient.pk == actor.pk:
        return None
    object_project = project or (task.project if task else None) or (sprint.project if sprint else None)
    if object_project is None or not user_can_access_project(recipient, object_project):
        return None
    preference_name = PREFERENCE_FOR_TYPE.get(kind)
    if preference_name:
        from users.models import UserPreferences
        enabled = UserPreferences.objects.filter(user=recipient).values_list(
            preference_name, flat=True
        ).first()
        if enabled is False:
            return None
    defaults = {
        'actor': actor,
        'type': kind,
        'title': title,
        'message': message,
        'task': task,
        'project': project or (task.project if task else None),
        'sprint': sprint,
    }
    if dedupe_key:
        notification, created = Notification.objects.get_or_create(
            dedupe_key=dedupe_key, defaults={'recipient': recipient, **defaults}
        )
        return notification if created else None
    return Notification.objects.create(recipient=recipient, **defaults)


def notify_project_members(*, project, kind, title, message, actor=None, sprint=None,
                           dedupe_key=None):
    recipients = set(project.memberships.values_list('user_id', flat=True))
    if project.team_id:
        recipients.update(project.team.memberships.values_list('user_id', flat=True))
    recipients.update(OrganizationMembership.objects.filter(
        organization_id=project.organization_id,
        is_active=True,
        status=OrganizationMembership.Status.ACTIVE,
        access_level__in=[
            OrganizationMembership.AccessLevel.OWNER,
            OrganizationMembership.AccessLevel.ADMIN,
        ],
    ).values_list('user_id', flat=True))
    from django.contrib.auth import get_user_model
    user_model = get_user_model()
    for recipient in user_model.objects.filter(pk__in=recipients).only('id'):
        create_notification(
            recipient=recipient,
            actor=actor,
            kind=kind,
            title=title,
            message=message,
            project=project,
            sprint=sprint,
            dedupe_key=f'{dedupe_key}:{recipient.pk}' if dedupe_key else None,
        )


def create_due_reminders(user, organization_id=None):
    from datetime import timedelta
    from django.utils import timezone

    today = timezone.localdate()
    tomorrow = today + timedelta(days=1)
    project_ids = accessible_project_ids(user, organization_id)
    tasks = Task.objects.filter(
        project_id__in=project_ids,
        assigned_to=user,
        due_date__isnull=False,
    ).exclude(status=Task.Status.COMPLETED).select_related('project')
    for task in tasks.filter(due_date=tomorrow):
        create_notification(
            recipient=user,
            kind=Notification.NotificationTypes.TASK_DUE,
            title='Task due tomorrow',
            message=f'"{task.title}" is due tomorrow.',
            task=task,
            dedupe_key=f'task-due:{task.pk}:{task.due_date.isoformat()}',
        )
    for task in tasks.filter(due_date__lt=today):
        create_notification(
            recipient=user,
            kind=Notification.NotificationTypes.TASK_OVERDUE,
            title='Overdue task',
            message=f'"{task.title}" is overdue.',
            task=task,
            dedupe_key=f'task-overdue:{task.pk}:{task.due_date.isoformat()}',
        )

    sprints = Sprint.objects.filter(
        project_id__in=project_ids,
        status__in=[Sprint.Status.PLANNED, Sprint.Status.ACTIVE],
    ).select_related('project')
    for sprint in sprints.filter(
        start_date=tomorrow,
    ):
        notify_project_members(
            project=sprint.project,
            sprint=sprint,
            kind=Notification.NotificationTypes.SPRINT_STARTED,
            title='Sprint starts tomorrow',
            message=f'{sprint.name} starts tomorrow.',
            actor=None,
            dedupe_key=f'sprint-start:{sprint.pk}:{sprint.start_date.isoformat()}',
        )
    for sprint in sprints.filter(status=Sprint.Status.ACTIVE, end_date=tomorrow):
        notify_project_members(
            project=sprint.project,
            sprint=sprint,
            kind=Notification.NotificationTypes.SPRINT_ENDING,
            title='Sprint ending tomorrow',
            message=f'{sprint.name} ends tomorrow.',
            actor=None,
            dedupe_key=f'sprint-ending:{sprint.pk}:{sprint.end_date.isoformat()}',
        )
