import re
import secrets
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Sum, Q, Count
from rest_framework import serializers

from apps.users.models import UserRole, CustomerAddress, AddressType
from apps.users.serializers_address import CustomerAddressSerializer
from apps.orders.models import Order, OrderStatus, PaymentStatus

User = get_user_model()


class CustomerListSerializer(serializers.ModelSerializer):
    """
    Authoritative Customer list serializer for administrative management.
    Includes database-aggregated order volume, revenue, and customer classification.
    """
    customer_id = serializers.SerializerMethodField()
    name = serializers.SerializerMethodField()
    customer_type = serializers.SerializerMethodField()
    orders_count = serializers.IntegerField(source='annotated_orders_count', read_only=True, default=0)
    total_spent = serializers.DecimalField(source='annotated_total_spent', max_digits=14, decimal_places=2, read_only=True, default=Decimal('0.00'))
    outstanding_balance = serializers.DecimalField(source='annotated_outstanding', max_digits=14, decimal_places=2, read_only=True, default=Decimal('0.00'))

    class Meta:
        model = User
        fields = [
            'id',
            'customer_id',
            'name',
            'first_name',
            'last_name',
            'email',
            'phone',
            'customer_type',
            'orders_count',
            'total_spent',
            'outstanding_balance',
            'is_active',
            'created_at',
            'updated_at',
        ]
        read_only_fields = fields

    def get_customer_id(self, obj: User) -> str:
        return f"CUST-{obj.id:05d}"

    def get_name(self, obj: User) -> str:
        full = f"{obj.first_name} {obj.last_name}".strip()
        if full:
            return full
        if obj.username and obj.username != obj.email:
            return obj.username
        return obj.email.split('@')[0]

    def get_customer_type(self, obj: User) -> str:
        # If annotated or flagged with business orders, classify as B2B
        if getattr(obj, 'has_business_orders', 0) > 0:
            return 'B2B'
        return 'B2C'


class CustomerRecentOrderSerializer(serializers.ModelSerializer):
    items_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Order
        fields = [
            'id',
            'order_number',
            'created_at',
            'status',
            'payment_status',
            'payment_method',
            'total_amount',
            'items_count',
        ]
        read_only_fields = fields


class CustomerDetailSerializer(serializers.ModelSerializer):
    """
    Comprehensive customer detail serializer providing profile, address book,
    order breakdown, financial metrics, and recent order history.
    """
    customer_id = serializers.SerializerMethodField()
    name = serializers.SerializerMethodField()
    customer_type = serializers.SerializerMethodField()
    addresses = CustomerAddressSerializer(many=True, read_only=True)
    order_summary = serializers.SerializerMethodField()
    financial_summary = serializers.SerializerMethodField()
    recent_orders = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id',
            'customer_id',
            'name',
            'first_name',
            'last_name',
            'email',
            'phone',
            'role',
            'is_active',
            'customer_type',
            'created_at',
            'updated_at',
            'last_login',
            'addresses',
            'order_summary',
            'financial_summary',
            'recent_orders',
        ]
        read_only_fields = fields

    def get_customer_id(self, obj: User) -> str:
        return f"CUST-{obj.id:05d}"

    def get_name(self, obj: User) -> str:
        full = f"{obj.first_name} {obj.last_name}".strip()
        return full if full else obj.email.split('@')[0]

    def get_customer_type(self, obj: User) -> str:
        if obj.orders.filter(is_business_order=True).exists():
            return 'B2B'
        return 'B2C'

    def get_order_summary(self, obj: User) -> dict:
        orders = obj.orders.all()
        total_orders = orders.count()
        pending_orders = orders.filter(
            status__in=[OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.PACKED, OrderStatus.SHIPPED]
        ).count()
        completed_orders = orders.filter(status=OrderStatus.DELIVERED).count()
        cancelled_orders = orders.filter(status=OrderStatus.CANCELLED).count()
        returned_orders = orders.filter(status__startswith='RETURN').count()

        spent_agg = orders.exclude(status=OrderStatus.CANCELLED).aggregate(total=Sum('total_amount'))
        total_spent = spent_agg['total'] or Decimal('0.00')

        return {
            'total_orders': total_orders,
            'pending_orders': pending_orders,
            'completed_orders': completed_orders,
            'cancelled_orders': cancelled_orders,
            'returned_orders': returned_orders,
            'total_spent': str(total_spent.quantize(Decimal('0.01'))),
        }

    def get_financial_summary(self, obj: User) -> dict:
        orders = obj.orders.all()
        # Find invoices linked directly or via order
        from apps.finance.models import Invoice, InvoiceStatus

        order_ids = list(orders.values_list('id', flat=True))
        invoices = Invoice.objects.filter(order_id__in=order_ids).exclude(status=InvoiceStatus.CANCELLED)
        inv_count = invoices.count()

        inv_agg = invoices.aggregate(total=Sum('total_amount'))
        total_invoiced = inv_agg['total'] or Decimal('0.00')

        # Paid amount calculation
        paid_orders_agg = orders.filter(
            payment_status=PaymentStatus.PAID
        ).exclude(status=OrderStatus.CANCELLED).aggregate(total=Sum('total_amount'))
        paid_amount = paid_orders_agg['total'] or Decimal('0.00')

        # Outstanding amount calculation (pending payment orders + unpaid invoices)
        pending_orders_agg = orders.filter(
            payment_status=PaymentStatus.PENDING
        ).exclude(status=OrderStatus.CANCELLED).aggregate(total=Sum('total_amount'))
        outstanding_amount = pending_orders_agg['total'] or Decimal('0.00')

        return {
            'total_invoiced': str(total_invoiced.quantize(Decimal('0.01'))),
            'paid_amount': str(paid_amount.quantize(Decimal('0.01'))),
            'outstanding_amount': str(outstanding_amount.quantize(Decimal('0.01'))),
            'invoice_count': inv_count,
        }

    def get_recent_orders(self, obj: User) -> list:
        recent = obj.orders.annotate(
            items_count=Count('items')
        ).order_by('-created_at')[:10]
        return CustomerRecentOrderSerializer(recent, many=True).data


class CustomerCreateSerializer(serializers.Serializer):
    """
    Admin customer creation serializer.
    Creates User with Customer role, enforces security without storing plaintext passwords,
    and optionally attaches the initial shipping/billing address.
    """
    first_name = serializers.CharField(required=True, max_length=150, allow_blank=False)
    last_name = serializers.CharField(required=False, max_length=150, allow_blank=True, default='')
    email = serializers.EmailField(required=True, max_length=255)
    phone = serializers.CharField(required=False, max_length=20, allow_blank=True, default='')
    password = serializers.CharField(required=False, allow_blank=True, write_only=True, default='')
    is_active = serializers.BooleanField(required=False, default=True)

    # Optional address fields
    address_line1 = serializers.CharField(required=False, max_length=255, allow_blank=True, default='')
    address_line2 = serializers.CharField(required=False, max_length=255, allow_blank=True, default='')
    landmark = serializers.CharField(required=False, max_length=150, allow_blank=True, default='')
    city = serializers.CharField(required=False, max_length=100, allow_blank=True, default='')
    state = serializers.CharField(required=False, max_length=100, allow_blank=True, default='')
    pincode = serializers.CharField(required=False, max_length=10, allow_blank=True, default='')
    address_type = serializers.ChoiceField(
        choices=AddressType.choices,
        required=False,
        default=AddressType.HOME
    )

    def validate_email(self, value):
        normalized = value.strip().lower()
        if User.objects.filter(email__iexact=normalized).exists():
            raise serializers.ValidationError("A customer account with this email address already exists.")
        return normalized

    def validate_pincode(self, value):
        if value:
            cleaned = value.strip()
            if not re.match(r'^[1-9][0-9]{5}$', cleaned):
                raise serializers.ValidationError("PIN code must be a valid 6-digit Indian postal code.")
            return cleaned
        return ''

    def validate_password(self, value):
        if value:
            try:
                validate_password(value)
            except DjangoValidationError as err:
                raise serializers.ValidationError(list(err.messages))
        return value

    def create(self, validated_data):
        email = validated_data['email']
        first_name = validated_data['first_name'].strip()
        last_name = validated_data.get('last_name', '').strip()
        phone = validated_data.get('phone', '').strip()
        raw_password = validated_data.get('password')
        is_active = validated_data.get('is_active', True)

        # Address data
        address_line1 = validated_data.get('address_line1', '').strip()
        address_line2 = validated_data.get('address_line2', '').strip()
        landmark = validated_data.get('landmark', '').strip()
        city = validated_data.get('city', '').strip()
        state = validated_data.get('state', '').strip()
        pincode = validated_data.get('pincode', '').strip()
        address_type = validated_data.get('address_type', AddressType.HOME)

        # If no password is provided, generate a cryptographically strong random password
        if not raw_password:
            raw_password = secrets.token_urlsafe(18)

        user = User.objects.create_user(
            email=email,
            password=raw_password,
            username=email,
            first_name=first_name,
            last_name=last_name,
            phone=phone,
            role=UserRole.CUSTOMER,
            is_staff=False,
            is_superuser=False,
            is_active=is_active,
        )

        # Attach initial address if supplied
        if address_line1 and city and state and pincode:
            CustomerAddress.objects.create(
                user=user,
                recipient_name=f"{first_name} {last_name}".strip(),
                phone=phone or '+91 0000000000',
                address_line1=address_line1,
                address_line2=address_line2,
                landmark=landmark,
                city=city,
                state=state,
                pincode=pincode,
                address_type=address_type,
                is_default=True,
            )

        return user


class CustomerUpdateSerializer(serializers.ModelSerializer):
    """
    Admin customer profile update serializer.
    Guarantees that omitted fields are never overwritten with null/empty values.
    """
    class Meta:
        model = User
        fields = [
            'first_name',
            'last_name',
            'email',
            'phone',
            'is_active',
        ]
        extra_kwargs = {
            'first_name': {'required': False},
            'last_name': {'required': False},
            'email': {'required': False},
            'phone': {'required': False},
            'is_active': {'required': False},
        }

    def validate_email(self, value):
        normalized = value.strip().lower()
        if User.objects.filter(email__iexact=normalized).exclude(pk=self.instance.pk).exists():
            raise serializers.ValidationError("Another user already exists with this email address.")
        return normalized

    def update(self, instance, validated_data):
        email_changed = False
        if 'email' in validated_data and validated_data['email'] != instance.email:
            email_changed = True
            instance.email = validated_data['email']
            instance.username = validated_data['email']

        if 'first_name' in validated_data:
            instance.first_name = validated_data['first_name'].strip()
        if 'last_name' in validated_data:
            instance.last_name = validated_data['last_name'].strip()
        if 'phone' in validated_data:
            instance.phone = validated_data['phone'].strip()
        if 'is_active' in validated_data:
            instance.is_active = validated_data['is_active']

        instance.save()
        return instance


class CustomerStatusToggleSerializer(serializers.Serializer):
    is_active = serializers.BooleanField(required=False)
    reason = serializers.CharField(required=False, allow_blank=True, default='')
