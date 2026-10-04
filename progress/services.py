from datetime import timedelta

from django.db import IntegrityError
from django.db.models import Count, Q, Sum
from django.utils import timezone

from communication.models import Activity
from organizations.models import OrganizationMembership
from projects.models import Project, ProjectMembership, Sprint
from tasks.models import Task
from teams.models import TeamMembership

from .models import UserAchievement, XPTransaction


LEVEL_THRESHOLDS = (0, 100, 250, 500, 850)

ACHIEVEMENTS = (
    {'key': 'FIRST_FINISHER', 'name': 'First Finisher', 'description': 'Complete your first task.', 'icon': 'check', 'xp_reward': 20, 'target': 1},
    {'key': 'EARLY_BIRD', 'name': 'Early Bird', 'description': 'Complete five tasks before their deadlines.', 'icon': 'clock', 'xp_reward': 30, 'target': 5},
    {'key': 'SPRINT_FINISHER', 'name': 'Sprint Finisher', 'description': 'Complete all assigned work in a sprint.', 'icon': 'flag', 'xp_reward': 50, 'target': 1},
    {'key': 'CONSISTENT', 'name': 'Consistent', 'description': 'Maintain a seven-day meaningful activity streak.', 'icon': 'trend', 'xp_reward': 35, 'target': 7},
    {'key': 'PROBLEM_SOLVER', 'name': 'Problem Solver', 'description': 'Resolve ten blocked tasks.', 'icon': 'zap', 'xp_reward': 40, 'target': 10},
    {'key': 'TEAM_PLAYER', 'name': 'Team Player', 'description': 'Receive five teammate recognitions.', 'icon': 'users', 'xp_reward': 40, 'target': 5},
    {'key': 'MILESTONE_MAKER', 'name': 'Milestone Maker', 'description': 'Contribute to five completed milestones.', 'icon': 'milestone', 'xp_reward': 45, 'target': 5},
    {'key': 'MOMENTUM', 'name': 'Momentum', 'description': 'Contribute to three completed sprints.', 'icon': 'layers', 'xp_reward': 50, 'target': 3},
    {'key': 'ON_TIME_TEN', 'name': 'On the Mark', 'description': 'Complete ten tasks by their deadlines.', 'icon': 'clock', 'xp_reward': 45, 'target': 10},
    {'key': 'PROJECT_RANGE', 'name': 'Cross-functional', 'description': 'Contribute to three different projects.', 'icon': 'layers', 'xp_reward': 35, 'target': 3},
    {'key': 'COLLABORATOR', 'name': 'Collaborator', 'description': 'Add ten meaningful task or project comments.', 'icon': 'users', 'xp_reward': 30, 'target': 10},
)


def level_for_xp(total_xp):
    thresholds = list(LEVEL_THRESHOLDS)
    while total_xp >= thresholds[-1]:
        next_increment = (thresholds[-1] - thresholds[-2]) + 100
        thresholds.append(thresholds[-1] + next_increment)
    level = max(index + 1 for index, threshold in enumerate(thresholds) if total_xp >= threshold)
    current_floor = thresholds[level - 1]
    next_floor = thresholds[level] if level < len(thresholds) else thresholds[-1]
    return {
        'level': level,
        'current_level_xp': current_floor,
        'next_level_xp': next_floor,
        'xp_into_level': total_xp - current_floor,
        'xp_to_next_level': next_floor - total_xp,
    }


def award_xp(*, user, organization, amount, reason, description, source_type, source_id):
    if amount <= 0:
        return None
    try:
        transaction_row, created = XPTransaction.objects.get_or_create(
            user=user,
            organization=organization,
            reason=reason,
            source_type=source_type,
            source_id=source_id,
            defaults={'amount': amount, 'description': description},
        )
    except IntegrityError:
        return None
    return transaction_row if created else None


def award_task_completion(task, actor):
    user = task.assigned_to or actor
    organization = task.project.organization
    award_xp(
        user=user, organization=organization, amount=5,
        reason='TASK_COMPLETED', description=f'Completed "{task.title}"',
        source_type='task', source_id=task.id,
    )
    if task.priority in (Task.Priority.HIGH, Task.Priority.URGENT):
        award_xp(
            user=user, organization=organization, amount=5,
            reason='HIGH_PRIORITY_COMPLETION', description=f'Completed high-priority task "{task.title}"',
            source_type='task', source_id=task.id,
        )
    if task.due_date and timezone.localdate() <= task.due_date:
        award_xp(
            user=user, organization=organization, amount=5,
            reason='ON_TIME_COMPLETION', description=f'Completed "{task.title}" on time',
            source_type='task', source_id=task.id,
        )


def award_completed_sprint(sprint):
    tasks = list(sprint.tasks.filter(is_archived=False).select_related('assigned_to'))
    if not tasks or any(task.status != Task.Status.COMPLETED for task in tasks):
        return
    recipients = {task.assigned_to for task in tasks if task.assigned_to_id}
    if not recipients:
        recipients = {sprint.created_by}
    for user in recipients:
        award_xp(
            user=user, organization=sprint.project.organization, amount=50,
            reason='SPRINT_GOAL_COMPLETED',
            description=f'Completed sprint goal "{sprint.name}"',
            source_type='sprint', source_id=sprint.id,
        )


def award_completed_milestone(milestone, actor):
    tasks = list(milestone.tasks.filter(is_archived=False).select_related('assigned_to'))
    recipients = {task.assigned_to for task in tasks if task.assigned_to_id} or {actor}
    for user in recipients:
        award_xp(
            user=user, organization=milestone.project.organization, amount=30,
            reason='MILESTONE_COMPLETED',
            description=f'Contributed to milestone "{milestone.title}"',
            source_type='milestone', source_id=milestone.id,
        )


def refresh_member_achievements(user, organization):
    metrics = _progress_metrics(user, organization)
    return sync_achievements(user, organization, metrics)


def _member_activity_dates(user, organization):
    project_ids = Project.objects.filter(
        organization=organization, is_archived=False
    ).filter(
        Q(memberships__user=user) | Q(team__memberships__user=user)
        | Q(tasks__assigned_to=user)
    ).values_list('id', flat=True).distinct()
    meaningful_actions = [
        Activity.ActionTypes.COMPLETED,
        Activity.ActionTypes.STATUS_CHANGED,
        Activity.ActionTypes.TASK_UPDATED,
        Activity.ActionTypes.COMMENTED,
        Activity.ActionTypes.SPRINT_STARTED,
        Activity.ActionTypes.SPRINT_COMPLETED,
        Activity.ActionTypes.MILESTONE_COMPLETED,
    ]
    rows = Activity.objects.filter(
        actor=user,
        project_id__in=project_ids,
        action__in=meaningful_actions,
    ).values_list('created_at__date', flat=True).distinct()
    return set(rows), project_ids


def calculate_streak(activity_dates, today=None):
    today = today or timezone.localdate()
    if today not in activity_dates:
        today -= timedelta(days=1)
    streak = 0
    while today in activity_dates:
        streak += 1
        today -= timedelta(days=1)
    return streak


def _progress_metrics(user, organization):
    completed_tasks = Task.objects.filter(
        project__organization=organization,
        project__is_archived=False,
        is_archived=False,
        status=Task.Status.COMPLETED,
        assigned_to=user,
    ).select_related('project', 'sprint')
    completed_count = completed_tasks.count()
    on_time_count = 0
    early_count = 0
    due_date_task_count = completed_tasks.filter(due_date__isnull=False).count()
    if completed_count:
        completion_dates = {}
        for task_id, completed_on in Activity.objects.filter(
            task__in=completed_tasks,
            action=Activity.ActionTypes.COMPLETED,
        ).order_by('-created_at').values_list('task_id', 'created_at__date'):
            completion_dates.setdefault(task_id, completed_on)
        for task in completed_tasks:
            completed_on = completion_dates.get(task.id)
            if task.due_date and completed_on:
                on_time_count += completed_on <= task.due_date
                early_count += completed_on < task.due_date

    activity_dates, project_ids = _member_activity_dates(user, organization)
    streak = calculate_streak(activity_dates)
    blocked_resolved = Activity.objects.filter(
        actor=user,
        project_id__in=project_ids,
        action=Activity.ActionTypes.STATUS_CHANGED,
        details__old=Task.Status.BLOCKED,
    ).exclude(details__new=Task.Status.BLOCKED).count()
    comments = Activity.objects.filter(
        actor=user, project_id__in=project_ids, action=Activity.ActionTypes.COMMENTED
    ).count()

    sprint_rows = list(Sprint.objects.filter(
        project__organization=organization,
        project__is_archived=False,
        status=Sprint.Status.COMPLETED,
        tasks__assigned_to=user,
    ).distinct())
    sprint_finisher = any(
        sprint.tasks.filter(assigned_to=user, is_archived=False).exists()
        and not sprint.tasks.filter(
            assigned_to=user, is_archived=False
        ).exclude(status=Task.Status.COMPLETED).exists()
        for sprint in sprint_rows
    )
    milestone_count = XPTransaction.objects.filter(
        user=user,
        organization=organization,
        reason='MILESTONE_COMPLETED',
    ).count()

    return {
        'completed_tasks': completed_count,
        'on_time_tasks': on_time_count,
        'completed_tasks_with_due_date': due_date_task_count,
        'early_bird': early_count,
        'streak': streak,
        'blocked_resolved': blocked_resolved,
        'recognitions': user.recognitions_received.filter(organization=organization).count(),
        'sprints_completed': len(sprint_rows),
        'sprint_finisher': sprint_finisher,
        'milestones_completed': milestone_count,
        'comments': comments,
        'projects_contributed': Task.objects.filter(
            project__organization=organization,
            project__is_archived=False,
            is_archived=False,
            assigned_to=user,
        ).values('project_id').distinct().count(),
    }


def sync_achievements(user, organization, metrics):
    tasks_completed = metrics['completed_tasks']
    targets = {
        'FIRST_FINISHER': tasks_completed,
        'EARLY_BIRD': metrics['early_bird'],
        'SPRINT_FINISHER': int(metrics.get('sprint_finisher', False)),
        'CONSISTENT': metrics['streak'],
        'PROBLEM_SOLVER': metrics['blocked_resolved'],
        'TEAM_PLAYER': metrics['recognitions'],
        'MILESTONE_MAKER': metrics['milestones_completed'],
        'MOMENTUM': metrics['sprints_completed'],
        'ON_TIME_TEN': metrics['on_time_tasks'],
        'PROJECT_RANGE': metrics['projects_contributed'],
        'COLLABORATOR': metrics['comments'],
    }
    unlocked = set(UserAchievement.objects.filter(
        user=user, organization=organization
    ).values_list('key', flat=True))
    for achievement in ACHIEVEMENTS:
        current = targets[achievement['key']]
        if current >= achievement['target'] and achievement['key'] not in unlocked:
            row, created = UserAchievement.objects.get_or_create(
                user=user, organization=organization, key=achievement['key']
            )
            if created:
                award_xp(
                    user=user,
                    organization=organization,
                    amount=achievement['xp_reward'],
                    reason='ACHIEVEMENT_UNLOCKED',
                    description=f'Achievement unlocked: {achievement["name"]}',
                    source_type='achievement',
                    source_id=row.id,
                )
                unlocked.add(achievement['key'])
    return unlocked


def member_progress(user, organization, sync_achievement_state=True):
    membership = OrganizationMembership.objects.filter(
        user=user,
        organization=organization,
        is_active=True,
        status=OrganizationMembership.Status.ACTIVE,
    ).first()
    if membership is None:
        return None
    metrics = _progress_metrics(user, organization)
    active_sprints = Sprint.objects.filter(
        project__organization=organization,
        project__is_archived=False,
        status=Sprint.Status.ACTIVE,
    ).select_related('project').order_by('end_date')
    current_sprint = None
    for sprint in active_sprints:
        sprint_tasks = sprint.tasks.filter(is_archived=False)
        total = sprint_tasks.filter(assigned_to=user).count()
        complete = sprint_tasks.filter(assigned_to=user, status=Task.Status.COMPLETED).count()
        if total:
            dated_completed_tasks = list(sprint_tasks.filter(
                assigned_to=user,
                status=Task.Status.COMPLETED,
                due_date__isnull=False,
            ).values('id', 'due_date'))
            completion_dates = {}
            for task_id, completed_on in Activity.objects.filter(
                task_id__in=[task['id'] for task in dated_completed_tasks],
                action=Activity.ActionTypes.COMPLETED,
            ).order_by('-created_at').values_list('task_id', 'created_at__date'):
                completion_dates.setdefault(task_id, completed_on)
            sprint_on_time = sum(
                completion_dates.get(task['id']) is not None
                and completion_dates[task['id']] <= task['due_date']
                for task in dated_completed_tasks
            )
            sprint_on_time_percent = round(
                sprint_on_time * 100 / len(dated_completed_tasks)
            ) if dated_completed_tasks else 0
            current_sprint = {
                'id': sprint.id,
                'name': sprint.name,
                'project': sprint.project.name,
                'total_tasks': total,
                'completed_tasks': complete,
                'progress': round(complete * 100 / total),
                'completion_percent': round(complete * 100 / total),
                'contribution': (
                    'High' if complete * 100 / total >= 75
                    else 'Building' if complete * 100 / total >= 40
                    else 'Getting started'
                ),
                'on_time_percent': sprint_on_time_percent,
            }
            break

    if sync_achievement_state:
        unlocked = sync_achievements(user, organization, metrics)
    else:
        unlocked = set(UserAchievement.objects.filter(
            user=user, organization=organization
        ).values_list('key', flat=True))
    activity_dates, project_ids = _member_activity_dates(user, organization)
    today = timezone.localdate()
    week_activity = [
        {
            'date': (today - timedelta(days=offset)).isoformat(),
            'active': (today - timedelta(days=offset)) in activity_dates,
        }
        for offset in reversed(range(7))
    ]
    recent_activity = Activity.objects.filter(
        actor=user,
        project_id__in=project_ids,
        action__in=[
            Activity.ActionTypes.COMPLETED,
            Activity.ActionTypes.STATUS_CHANGED,
            Activity.ActionTypes.TASK_UPDATED,
            Activity.ActionTypes.COMMENTED,
            Activity.ActionTypes.SPRINT_STARTED,
            Activity.ActionTypes.SPRINT_COMPLETED,
            Activity.ActionTypes.MILESTONE_COMPLETED,
        ],
    ).select_related('project', 'task')[:8]
    xp_rows = list(XPTransaction.objects.filter(
        user=user, organization=organization
    ).order_by('-created_at')[:12])
    total_xp = XPTransaction.objects.filter(
        user=user, organization=organization
    ).aggregate(total=Sum('amount'))['total'] or 0
    level = level_for_xp(total_xp)
    level['progress_percent'] = round(
        level['xp_into_level'] * 100
        / max(1, level['next_level_xp'] - level['current_level_xp'])
    )
    level['xp_in_level'] = level['xp_into_level']
    teams = TeamMembership.objects.filter(
        user=user, team__organization=organization, team__is_archived=False
    ).select_related('team')
    achievements = []
    for item in ACHIEVEMENTS:
        target = {
            'FIRST_FINISHER': metrics['completed_tasks'],
            'EARLY_BIRD': metrics['early_bird'],
            'SPRINT_FINISHER': int(metrics.get('sprint_finisher', False)),
            'CONSISTENT': metrics['streak'],
            'PROBLEM_SOLVER': metrics['blocked_resolved'],
            'TEAM_PLAYER': metrics['recognitions'],
            'MILESTONE_MAKER': metrics['milestones_completed'],
            'MOMENTUM': metrics['sprints_completed'],
            'ON_TIME_TEN': metrics['on_time_tasks'],
            'PROJECT_RANGE': metrics['projects_contributed'],
            'COLLABORATOR': metrics['comments'],
        }[item['key']]
        achievements.append({
            **item,
            'unlocked': item['key'] in unlocked,
            'progress': min(target, item['target']),
        })
    contribution = []
    projects = Project.objects.filter(
        organization=organization, is_archived=False
    ).filter(
        Q(memberships__user=user) | Q(team__memberships__user=user) | Q(tasks__assigned_to=user)
    ).annotate(
        task_count=Count('tasks', filter=Q(tasks__assigned_to=user, tasks__is_archived=False), distinct=True),
        completed_count=Count('tasks', filter=Q(
            tasks__assigned_to=user, tasks__is_archived=False, tasks__status=Task.Status.COMPLETED
        ), distinct=True),
    ).distinct()
    for project in projects:
        contribution.append({
            'id': project.id,
            'name': project.name,
            'total_tasks': project.task_count,
            'completed_tasks': project.completed_count,
            'progress': round(project.completed_count * 100 / project.task_count) if project.task_count else 0,
            'completion_percent': round(project.completed_count * 100 / project.task_count) if project.task_count else 0,
        })

    return {
        'profile': {
            'id': user.id,
            'name': user.get_full_name() or user.email,
            'first_name': user.first_name,
            'last_name': user.last_name,
            'email': user.email,
            'avatar_url': user.avatar.url if user.avatar else None,
            'job_title': membership.job_title or '',
            'organization_role': membership.get_access_level_display(),
            'teams': [row.team.name for row in teams],
            'xp': total_xp,
            'level': level,
        },
        'xp': {
            'total': total_xp,
            **level,
            'recent': [{
                'id': row.id,
                'amount': row.amount,
                'reason': row.reason,
                'description': row.description,
                'created_at': row.created_at,
            } for row in xp_rows],
        },
        'streak': {
            'current': metrics['streak'],
            'week': week_activity,
        },
        'metrics': metrics,
        'stats': {
            **metrics,
            'achievements_unlocked': len(unlocked),
            'recognitions_received': metrics['recognitions'],
            'on_time_percent': round(
                metrics['on_time_tasks'] * 100 / metrics['completed_tasks_with_due_date']
            ) if metrics['completed_tasks_with_due_date'] else 0,
            'on_time_completions': metrics['on_time_tasks'],
        },
        'current_sprint': current_sprint,
        'achievements': achievements,
        'contribution': contribution,
        'recognitions': [{
            'id': item.id,
            'giver': item.giver.get_full_name() or item.giver.email,
            'message': item.message,
            'category': item.category,
            'created_at': item.created_at,
        } for item in user.recognitions_received.filter(organization=organization).select_related('giver')[:8]],
        'recent_activity': [{
            'id': item.id,
            'action': item.get_action_display(),
            'project': item.project.name,
            'task': item.task.title if item.task_id else '',
            'created_at': item.created_at,
        } for item in recent_activity],
    }
