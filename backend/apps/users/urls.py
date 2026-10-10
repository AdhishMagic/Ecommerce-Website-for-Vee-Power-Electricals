from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from .views import (
    CurrentUserView,
    GoogleLoginView,
    GoogleOAuthCallbackView,
    GoogleOAuthInitView,
    LoginView,
    LogoutView,
    PasswordResetConfirmView,
    PasswordResetView,
    RegisterView,
    RequestEmailVerificationView,
    ConfirmEmailVerificationView,
)

urlpatterns = [
    path('register/', RegisterView.as_view(), name='auth-register'),
    path('verify-email/request/', RequestEmailVerificationView.as_view(), name='auth-verify-email-request'),
    path('verify-email/confirm/', ConfirmEmailVerificationView.as_view(), name='auth-verify-email-confirm'),
    path('login/', LoginView.as_view(), name='auth-login'),
    path('google/', GoogleLoginView.as_view(), name='auth-google'),
    path('google/login/', GoogleOAuthInitView.as_view(), name='auth-google-login'),
    path('google/callback/', GoogleOAuthCallbackView.as_view(), name='auth-google-callback'),
    path('google/callback', GoogleOAuthCallbackView.as_view(), name='auth-google-callback-noslash'),
    path('token/refresh/', TokenRefreshView.as_view(), name='auth-token-refresh'),
    path('logout/', LogoutView.as_view(), name='auth-logout'),
    path('me/', CurrentUserView.as_view(), name='auth-me'),
    path('password-reset/', PasswordResetView.as_view(), name='auth-password-reset'),
    path('password-reset/confirm/', PasswordResetConfirmView.as_view(), name='auth-password-reset-confirm'),
]
