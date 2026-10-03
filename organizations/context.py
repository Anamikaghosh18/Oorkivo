from organizations.models import OrganizationMembership


def active_organization_ids(user):
    return OrganizationMembership.objects.filter(
        user=user,
        is_active=True,
        status=OrganizationMembership.Status.ACTIVE,
    ).values_list('organization_id', flat=True)


def current_organization_id(request):
    value = request.headers.get('X-Organization-ID')
    if value is None or not value.strip():
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return -1


def scope_to_current_organization(queryset, request, field='organization_id'):
    organization_id = current_organization_id(request)
    return queryset if organization_id is None else queryset.filter(**{field: organization_id})
