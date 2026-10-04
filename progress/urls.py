from django.urls import path

from .views import (
    MyProgressView,
    OrganizationProgressMembersView,
    ProgressOverviewView,
    RecognitionListCreateView,
    TeamCelebrationsView,
)

urlpatterns = [
    path('progress/me/', MyProgressView.as_view(), name='my-progress'),
    path('progress/members/', OrganizationProgressMembersView.as_view(), name='progress-members'),
    path('progress/overview/', ProgressOverviewView.as_view(), name='progress-overview'),
    path('progress/celebrations/', TeamCelebrationsView.as_view(), name='progress-celebrations'),
    path('progress/recognitions/', RecognitionListCreateView.as_view(), name='progress-recognitions'),
]
