from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ChatConversationViewSet,
    NotificationViewSet,
    TaskCommentAttachmentDownloadView,
    TaskCommentDetailView,
    TaskCommentListCreateView,
)

router = DefaultRouter()
router.register(r'conversations', ChatConversationViewSet, basename='chat-conversation')
router.register(r'notifications', NotificationViewSet, basename='notification')

urlpatterns = [
    path('tasks/<int:task_id>/comments/', TaskCommentListCreateView.as_view(), name='task-comments-list'),
    path('comment-attachments/<int:pk>/', TaskCommentAttachmentDownloadView.as_view(), name='task-comment-attachment-download'),
    path('comments/<int:pk>/', TaskCommentDetailView.as_view(), name='task-comment-detail'),
    path('', include(router.urls)),
]
