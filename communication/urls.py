from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import TaskCommentListCreateView, TaskCommentDetailView, NotificationViewSet

router = DefaultRouter()
router.register(r'notifications', NotificationViewSet, basename='notification')

urlpatterns = [
    path('tasks/<int:task_id>/comments/', TaskCommentListCreateView.as_view(), name='task-comments-list'),
    path('comments/<int:pk>/', TaskCommentDetailView.as_view(), name='task-comment-detail'),
    path('', include(router.urls)),
]
