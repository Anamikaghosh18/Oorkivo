from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import TaskViewSet, ProjectTasksAPIView, SavedTaskViewSet

router = DefaultRouter()
router.register(r'tasks', TaskViewSet, basename='task')
router.register(r'saved-views', SavedTaskViewSet, basename='saved-task-view')

urlpatterns = [
    
    path('projects/<int:project_id>/tasks/', ProjectTasksAPIView.as_view(), name='project-tasks'),

    path('', include(router.urls)),
]
