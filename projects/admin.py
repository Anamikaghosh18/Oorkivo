from django.contrib import admin
from .models import Project, ProjectDocument, ProjectMembership

admin.site.register(Project)
admin.site.register(ProjectDocument)
admin.site.register(ProjectMembership)
