from django.contrib.auth.models import AbstractUser
from django.db import models
from apps.common.models import TimeStampedModel

class User(AbstractUser, TimeStampedModel):
    email = models.EmailField(unique=True)
    phone = models.CharField(max_length=15, blank=True, null=True)
    is_admin = models.BooleanField(default=False)
    street = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=100, blank=True)
    state = models.CharField(max_length=100, blank=True)
    pincode = models.CharField(max_length=10, blank=True)

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['username', 'first_name', 'last_name']

    def __str__(self):
        return f"{self.email} ({self.get_full_name() or self.username})"
