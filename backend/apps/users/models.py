import re
from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.core.exceptions import ValidationError
from django.db import models
from django.conf import settings
from apps.common.models import TimeStampedModel


class UserRole(models.TextChoices):
    CUSTOMER = 'customer', 'Customer'
    ADMIN = 'admin', 'Administrator'


class AddressType(models.TextChoices):
    HOME = 'home', 'Home'
    WORK = 'work', 'Work'
    OTHER = 'other', 'Other'


class UserManager(BaseUserManager):
    """
    Custom manager for email-based User model.
    """
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError('Email address is required')
        email = self.normalize_email(email).lower()
        if not extra_fields.get('username'):
            extra_fields['username'] = email
        user = self.model(email=email, **extra_fields)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('role', UserRole.ADMIN)
        return self.create_user(email, password, **extra_fields)


class User(AbstractUser, TimeStampedModel):
    """
    Unified User model for Vee Electricals.
    Reconciles customer and administrator roles, eliminating redundant AdminProfile.
    """
    email = models.EmailField(unique=True, max_length=255)
    username = models.CharField(max_length=150, unique=True, blank=True)
    phone = models.CharField(max_length=20, null=True, blank=True)
    role = models.CharField(max_length=20, choices=UserRole.choices, default=UserRole.CUSTOMER)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    is_superuser = models.BooleanField(default=False)

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['first_name', 'last_name']

    objects = UserManager()

    class Meta:
        db_table = 'users'
        verbose_name = 'User'
        verbose_name_plural = 'Users'
        constraints = [
            models.CheckConstraint(
                check=models.Q(role__in=['customer', 'admin']),
                name='chk_users_role'
            ),
        ]
        indexes = [
            models.Index(fields=['role', 'is_active'], name='idx_users_role_active'),
        ]

    def clean(self):
        super().clean()
        if self.email:
            self.email = self.email.lower().strip()

    def save(self, *args, **kwargs):
        if not self.username and self.email:
            self.username = self.email
        if self.role == UserRole.ADMIN:
            self.is_staff = True
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.email} ({self.get_full_name() or self.role})"


class CustomerAddress(TimeStampedModel):
    """
    Customer shipping and billing address book.
    Enforces safe single default address per user via generated virtual column.
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='addresses'
    )
    recipient_name = models.CharField(max_length=150)
    phone = models.CharField(max_length=20)
    address_line1 = models.CharField(max_length=255)
    address_line2 = models.CharField(max_length=255, blank=True, default='')
    landmark = models.CharField(max_length=150, blank=True, default='')
    city = models.CharField(max_length=100)
    state = models.CharField(max_length=100)
    pincode = models.CharField(max_length=10)
    address_type = models.CharField(
        max_length=20,
        choices=AddressType.choices,
        default=AddressType.HOME
    )
    is_default = models.BooleanField(default=False)
    default_user_id = models.GeneratedField(
        expression=models.Case(
            models.When(is_default=True, then=models.F('user_id')),
            default=None
        ),
        output_field=models.BigIntegerField(null=True),
        db_persist=True,
        unique=True
    )

    class Meta:
        db_table = 'customer_addresses'
        verbose_name = 'Customer Address'
        verbose_name_plural = 'Customer Addresses'
        constraints = [
            models.CheckConstraint(
                check=models.Q(address_type__in=['home', 'work', 'other']),
                name='chk_addr_type'
            ),
        ]
        indexes = [
            models.Index(fields=['user'], name='idx_addr_user'),
        ]

    def clean(self):
        super().clean()
        if self.pincode:
            self.pincode = self.pincode.strip()
            if not re.match(r'^[1-9][0-9]{5}$', self.pincode):
                raise ValidationError({'pincode': 'PIN code must be a valid 6-digit Indian postal code.'})

    def validate_unique(self, exclude=None):
        exclude_list = list(exclude or [])
        if 'default_user_id' not in exclude_list:
            exclude_list.append('default_user_id')
        super().validate_unique(exclude=exclude_list)

    def save(self, *args, **kwargs):
        self.full_clean(exclude=['default_user_id'])
        if self.is_default:
            CustomerAddress.objects.filter(user=self.user, is_default=True).exclude(pk=self.pk).update(is_default=False)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.recipient_name} - {self.city}, {self.pincode} ({self.address_type})"
