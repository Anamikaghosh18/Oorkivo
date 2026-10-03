from django.urls import path
from . import views

urlpatterns = [
    path("register/", views.RegisterView.as_view(), name="register"),
    path("login/", views.LoginView.as_view(), name="login"),
    path("token/refresh/", views.TokenRefreshView.as_view(), name="token-refresh"),
    path("me/", views.MeView.as_view(), name="me"),
    path("me/avatar/", views.MeAvatarView.as_view(), name="me-avatar"),
    path("me/preferences/", views.MePreferencesView.as_view(), name="me-preferences"),
    path("invitations/accept/", views.AcceptOrganizationInvitationView.as_view(), name="accept-organization-invitation"),
]