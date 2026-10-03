import secrets

import organizations.models
from django.db import migrations, models


def populate_invitation_codes(apps, schema_editor):
    Invitation = apps.get_model('organizations', 'OrganizationInvitation')
    database = schema_editor.connection.alias
    alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
    for invitation in Invitation.objects.using(database).filter(
        invitation_code__isnull=True
    ).iterator():
        while True:
            code = f"OK-{''.join(secrets.choice(alphabet) for _ in range(12))}"
            if not Invitation.objects.using(database).filter(invitation_code=code).exists():
                break
        Invitation.objects.using(database).filter(pk=invitation.pk).update(
            invitation_code=code
        )


class Migration(migrations.Migration):

    dependencies = [
        ('organizations', '0005_organization_owner_organization_plan_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='organizationinvitation',
            name='invitation_code',
            field=models.CharField(blank=True, max_length=15, null=True),
        ),
        migrations.RunPython(populate_invitation_codes, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='organizationinvitation',
            name='email',
            field=models.EmailField(blank=True, max_length=254),
        ),
        migrations.AlterField(
            model_name='organizationinvitation',
            name='invitation_code',
            field=models.CharField(
                default=organizations.models.generate_invitation_code,
                editable=False,
                max_length=15,
                unique=True,
            ),
        ),
    ]
