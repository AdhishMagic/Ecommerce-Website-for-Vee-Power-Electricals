from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import UserViewSet, login_view, me_view

router = DefaultRouter()
router.register(r'users', UserViewSet, basename='user')

urlpatterns = [
    path('login/', login_view, name='auth-login'),
    path('me/', me_view, name='auth-me'),
    path('', include(router.urls)),
]
