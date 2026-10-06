from django.urls import path

from .views import (
    ChangePasswordView,
    NotificationSettingsView,
    RevokeSessionsView,
    SecurityOverviewView,
    SystemInformationView,
)

urlpatterns = [
    path('notifications/', NotificationSettingsView.as_view(), name='settings-notifications'),
    path('change-password/', ChangePasswordView.as_view(), name='settings-change-password'),
    path('security/', SecurityOverviewView.as_view(), name='settings-security'),
    path('security/revoke-sessions/', RevokeSessionsView.as_view(), name='settings-revoke-sessions'),
    path('system/', SystemInformationView.as_view(), name='settings-system'),
]
