from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver
from tasks.models import Task
from .models import Activity

@receiver(pre_save, sender=Task)
def task_pre_save(sender, instance, **kwargs):
    if instance.pk:
        try:
            old_instance = Task.objects.get(pk=instance.pk)
            instance._old_status = old_instance.status
            instance._old_assigned_to = old_instance.assigned_to
        except Task.DoesNotExist:
            pass

@receiver(post_save, sender=Task)
def task_post_save(sender, instance, created, **kwargs):
    # Determine the actor. If we don't have request.user in signals, we can approximate
    # by using created_by for creation, or we might need middleware or manual creation in views.
    # Since we can't easily get the current user in a signal without middleware (e.g. crum),
    # I'll just use created_by or assigned_to for now. In a real production app, 
    # we'd explicitly log activities in the View or via a service layer.
    
    actor = getattr(instance, '_current_user', instance.created_by) # Allow views to pass _current_user

    if created:
        Activity.objects.create(
            project=instance.project,
            task=instance,
            actor=actor,
            action=Activity.ActionTypes.CREATED,
            details={"title": instance.title}
        )
    else:
        old_status = getattr(instance, '_old_status', None)
        if old_status and old_status != instance.status:
            Activity.objects.create(
                project=instance.project,
                task=instance,
                actor=actor,
                action=Activity.ActionTypes.STATUS_CHANGED,
                details={"old": old_status, "new": instance.status}
            )
            
        old_assigned = getattr(instance, '_old_assigned_to', None)
        if instance.assigned_to and old_assigned != instance.assigned_to:
            Activity.objects.create(
                project=instance.project,
                task=instance,
                actor=actor,
                action=Activity.ActionTypes.ASSIGNED,
                details={"assigned_to": instance.assigned_to.first_name}
            )
