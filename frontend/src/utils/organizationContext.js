export function selectCurrentOrganization(user) {
  const memberships = (user?.organization_memberships ?? []).filter(
    (membership) => membership.status === 'ACTIVE',
  );
  const savedId = localStorage.getItem('current_organization_id');
  const selected = memberships.find(
    (membership) => String(membership.organization_id) === String(savedId),
  ) ?? memberships[0];

  if (!selected) {
    localStorage.removeItem('current_organization_id');
    return null;
  }

  localStorage.setItem('current_organization_id', String(selected.organization_id));
  return {
    id: selected.organization_id,
    name: selected.organization,
    description: selected.organization_description,
    logo_url: selected.organization_logo_url,
    plan: selected.organization_plan,
    permissions: selected.permissions,
    access_level: selected.access_level,
    membership: { role: selected.access_level, status: selected.status },
  };
}

export function activateOrganization(organizationId) {
  localStorage.setItem('current_organization_id', String(organizationId));
  window.location.reload();
}
