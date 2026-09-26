import re
from decimal import Decimal
from rest_framework import serializers
from .models import (
    Client,
    Quotation,
    QuotationItem,
    Invoice,
    InvoiceItem,
    PaymentTransaction,
    PayoutSettlement,
    QuotationStatus,
    InvoiceStatus,
    PaymentTxStatus,
    Expense,
    ExpenseCategory,
    ExpenseStatus,
    GST_STATE_CODES,
)


class ClientSerializer(serializers.ModelSerializer):
    pan = serializers.CharField(read_only=True)
    state = serializers.CharField(read_only=True)
    state_code = serializers.CharField(read_only=True)
    customer_type = serializers.CharField(read_only=True, default='CORPORATE')
    billing_address = serializers.CharField(source='address', required=False, allow_blank=True, allow_null=True)
    shipping_address = serializers.CharField(source='address', read_only=True)
    credit_exposure = serializers.SerializerMethodField()
    available_credit = serializers.SerializerMethodField()
    total_invoiced = serializers.SerializerMethodField()

    class Meta:
        model = Client
        fields = [
            'id', 'client_code', 'company_name', 'contact_person',
            'gstin', 'pan', 'state', 'state_code', 'customer_type',
            'email', 'phone', 'credit_limit', 'credit_exposure',
            'available_credit', 'total_invoiced', 'address',
            'billing_address', 'shipping_address', 'is_active',
            'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'pan', 'state', 'state_code', 'customer_type',
            'credit_exposure', 'available_credit', 'total_invoiced',
            'shipping_address', 'created_at', 'updated_at'
        ]
        extra_kwargs = {
            'client_code': {'required': False},
        }

    def get_credit_exposure(self, obj) -> str:
        from apps.finance.services.credit_service import CreditService
        return str(CreditService.get_outstanding_exposure(obj))

    def get_available_credit(self, obj) -> str:
        from apps.finance.services.credit_service import CreditService
        return str(CreditService.get_available_credit(obj))

    def get_total_invoiced(self, obj) -> str:
        from django.db.models import Sum
        total = obj.invoices.exclude(status=InvoiceStatus.CANCELLED).aggregate(total=Sum('total_amount'))['total'] or Decimal('0.00')
        return str(total.quantize(Decimal('0.01')))

    def validate_credit_limit(self, value):
        if value < Decimal('0.00'):
            raise serializers.ValidationError("Credit limit cannot be negative.")
        return value

    def validate_gstin(self, value):
        val = value.upper().strip()
        if not re.match(r'^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$', val):
            raise serializers.ValidationError("GSTIN must conform to 15-character Indian statutory format.")
        if val[:2] not in GST_STATE_CODES:
            raise serializers.ValidationError(f"Invalid GST state code '{val[:2]}'.")

        qs = Client.objects.filter(gstin=val)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(f"Client with GSTIN '{val}' already exists.")
        return val

    def validate_client_code(self, value):
        if not value:
            return value
        val = value.upper().strip()
        qs = Client.objects.filter(client_code=val)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(f"Client code '{val}' is already registered.")
        return val

    def create(self, validated_data):
        client = super().create(validated_data)
        from apps.core.models import AdminConfigAuditLog, AuditActionType
        request = self.context.get('request')
        user = request.user if request and request.user.is_authenticated else None
        ip = request.META.get('REMOTE_ADDR') if request else None
        AdminConfigAuditLog.objects.create(
            admin_user=user,
            domain='client_credit',
            record_id=client.id,
            action_type=AuditActionType.CREATE,
            old_value={'credit_limit': '0.00'},
            new_value={'credit_limit': str(client.credit_limit)},
            change_reason="Client created with initial credit limit",
            ip_address=ip,
        )
        return client

    def update(self, instance, validated_data):
        old_limit = instance.credit_limit
        old_active = instance.is_active
        client = super().update(instance, validated_data)

        request = self.context.get('request')
        user = request.user if request and request.user.is_authenticated else None
        ip = request.META.get('REMOTE_ADDR') if request else None

        from apps.core.models import AdminConfigAuditLog, AuditActionType
        if 'credit_limit' in validated_data and old_limit != client.credit_limit:
            reason = validated_data.get('reason') or (request.data.get('reason') if request else '') or f"Credit limit modified from ₹{old_limit} to ₹{client.credit_limit}"
            AdminConfigAuditLog.objects.create(
                admin_user=user,
                domain='client_credit',
                record_id=client.id,
                action_type=AuditActionType.UPDATE,
                old_value={'credit_limit': str(old_limit)},
                new_value={'credit_limit': str(client.credit_limit)},
                change_reason=reason,
                ip_address=ip,
            )

        if 'is_active' in validated_data and old_active != client.is_active:
            action = AuditActionType.UPDATE if client.is_active else AuditActionType.DEACTIVATE
            reason = validated_data.get('reason') or (request.data.get('reason') if request else '') or (f"Client {'activated' if client.is_active else 'deactivated'}")
            AdminConfigAuditLog.objects.create(
                admin_user=user,
                domain='client',
                record_id=client.id,
                action_type=action,
                old_value={'is_active': old_active},
                new_value={'is_active': client.is_active},
                change_reason=reason,
                ip_address=ip,
            )

        return client


class QuotationItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True, default='')

    class Meta:
        model = QuotationItem
        fields = [
            'id', 'quotation', 'product', 'product_name', 'item_name',
            'quantity', 'unit_price', 'subtotal', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']


class QuotationSerializer(serializers.ModelSerializer):
    client_name = serializers.CharField(source='client.company_name', read_only=True, default='')
    created_by_email = serializers.CharField(source='created_by.email', read_only=True, default='')
    items = QuotationItemSerializer(many=True, read_only=True)

    class Meta:
        model = Quotation
        fields = [
            'id', 'quotation_number', 'client', 'client_name',
            'quotation_date', 'expiry_date', 'total_value', 'status',
            'notes', 'created_by', 'created_by_email', 'items',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
        extra_kwargs = {
            'quotation_number': {'required': False},
            'quotation_date': {'required': False},
            'expiry_date': {'required': False},
        }

    def create(self, validated_data):
        from django.utils import timezone
        import datetime
        if not validated_data.get('quotation_date'):
            validated_data['quotation_date'] = timezone.now().date()
        if not validated_data.get('expiry_date'):
            validated_data['expiry_date'] = validated_data['quotation_date'] + datetime.timedelta(days=30)
        if not validated_data.get('quotation_number'):
            year = validated_data['quotation_date'].year
            count = Quotation.objects.filter(quotation_number__startswith=f"QUO-{year}").count() + 1
            num = f"QUO-{year}-{count:04d}"
            while Quotation.objects.filter(quotation_number=num).exists():
                count += 1
                num = f"QUO-{year}-{count:04d}"
            validated_data['quotation_number'] = num

        items_data = self.initial_data.get('items', [])
        items_to_create = []
        if items_data and isinstance(items_data, list):
            calculated_total = Decimal('0.00')
            from apps.products.models import Product
            for item in items_data:
                product_id = item.get('product') or item.get('product_id')
                product_obj = None
                if product_id:
                    try:
                        product_obj = Product.objects.get(pk=product_id)
                    except Product.DoesNotExist:
                        product_obj = None
                item_name = item.get('item_name') or item.get('product_name') or (product_obj.name if product_obj else 'Item')
                quantity = int(item.get('quantity', 1))
                unit_price = Decimal(str(item.get('unit_price') or item.get('price') or (product_obj.price if product_obj else 0)))
                subtotal = unit_price * quantity
                calculated_total += subtotal
                items_to_create.append({
                    'product': product_obj,
                    'item_name': item_name,
                    'quantity': quantity,
                    'unit_price': unit_price,
                    'subtotal': subtotal,
                })
            validated_data['total_value'] = calculated_total

        quotation = super().create(validated_data)
        for it in items_to_create:
            QuotationItem.objects.create(quotation=quotation, **it)
        return quotation


class InvoiceItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = InvoiceItem
        fields = [
            'id', 'invoice', 'product', 'item_name', 'sku',
            'quantity', 'rate', 'taxable_amount', 'tax_percent',
            'cgst_amount', 'sgst_amount', 'igst_amount', 'tax_amount',
            'total_amount', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']


class InvoiceSerializer(serializers.ModelSerializer):
    client_name = serializers.CharField(source='client.company_name', read_only=True, default='')
    order_number = serializers.CharField(source='order.order_number', read_only=True, default='')
    quotation_number = serializers.CharField(source='quotation.quotation_number', read_only=True, default='')
    items = InvoiceItemSerializer(many=True, read_only=True)

    class Meta:
        model = Invoice
        fields = [
            'id', 'invoice_number', 'invoice_date', 'due_date',
            'order', 'order_number', 'quotation', 'quotation_number',
            'client', 'client_name', 'subtotal', 'discount_amount',
            'taxable_amount', 'cgst_amount', 'sgst_amount', 'igst_amount',
            'tax_amount', 'shipping_fee', 'total_amount', 'status',
            'payment_status', 'notes', 'calculation_snapshot', 'items',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
        extra_kwargs = {
            'invoice_number': {'required': False},
            'invoice_date': {'required': False},
            'due_date': {'required': False},
            'subtotal': {'required': False},
            'taxable_amount': {'required': False},
            'total_amount': {'required': False},
        }

    def create(self, validated_data):
        from apps.finance.services.invoice_service import InvoiceService
        from django.utils import timezone
        import datetime
        invoice_date = validated_data.get('invoice_date') or timezone.now().date()
        validated_data['invoice_date'] = invoice_date
        if not validated_data.get('due_date'):
            validated_data['due_date'] = invoice_date + datetime.timedelta(days=30)
        if not validated_data.get('invoice_number'):
            validated_data['invoice_number'] = InvoiceService.generate_invoice_number(invoice_date)
            while Invoice.objects.filter(invoice_number=validated_data['invoice_number']).exists():
                seq_part = int(validated_data['invoice_number'].split('-')[-1]) + 1
                year_part = validated_data['invoice_number'].split('-')[1]
                validated_data['invoice_number'] = f"INV-{year_part}-{seq_part:04d}"

        subtotal = validated_data.get('subtotal', Decimal('0.00'))
        tax_amount = validated_data.get('tax_amount', Decimal('0.00'))
        if not validated_data.get('total_amount'):
            validated_data['total_amount'] = subtotal + tax_amount
        if not validated_data.get('taxable_amount'):
            validated_data['taxable_amount'] = subtotal

        client = validated_data.get('client')
        inv_status = validated_data.get('status', InvoiceStatus.UNPAID)
        total_amt = validated_data.get('total_amount', Decimal('0.00'))
        if client and inv_status in [InvoiceStatus.UNPAID, InvoiceStatus.OVERDUE]:
            if not client.is_active:
                raise serializers.ValidationError(f"Cannot create invoice for inactive client {client.company_name}.")
            if client.credit_limit > Decimal('0.00'):
                from apps.finance.services.credit_service import CreditService
                from django.core.exceptions import ValidationError as DjangoValidationError
                try:
                    CreditService.validate_credit_limit(client, additional_amount=total_amt, lock_client=True)
                except DjangoValidationError as e:
                    msg = e.message if hasattr(e, 'message') else str(e)
                    raise serializers.ValidationError({"credit_limit": msg})

        return super().create(validated_data)


class PaymentTransactionSerializer(serializers.ModelSerializer):
    order_number = serializers.CharField(source='order.order_number', read_only=True, default='')
    invoice_number = serializers.CharField(source='invoice.invoice_number', read_only=True, default='')

    class Meta:
        model = PaymentTransaction
        fields = [
            'id', 'order', 'order_number', 'invoice', 'invoice_number',
            'gateway', 'gateway_transaction_id', 'gateway_order_id',
            'gateway_signature', 'payment_method', 'amount', 'currency',
            'status', 'error_code', 'error_message', 'metadata',
            'created_at', 'updated_at'
        ]
        read_only_fields = fields


class PayoutSettlementSerializer(serializers.ModelSerializer):
    class Meta:
        model = PayoutSettlement
        fields = [
            'id', 'settlement_id', 'gateway', 'settlement_date',
            'gross_amount', 'gateway_fee', 'tax_on_fee', 'net_amount',
            'status', 'utr', 'notes', 'created_at', 'updated_at'
        ]
        read_only_fields = fields


class ExpenseSerializer(serializers.ModelSerializer):
    created_by_email = serializers.CharField(source='created_by.email', read_only=True, default='')
    date = serializers.DateField(source='expense_date', read_only=True)

    class Meta:
        model = Expense
        fields = [
            'id',
            'expense_date',
            'date',
            'category',
            'description',
            'vendor',
            'amount',
            'status',
            'payment_mode',
            'receipt_url',
            'created_by',
            'created_by_email',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_by', 'created_by_email', 'created_at', 'updated_at', 'date']

    def to_internal_value(self, data):
        # Support 'date' as an alias for 'expense_date' on incoming payloads
        if isinstance(data, dict) and 'date' in data and 'expense_date' not in data:
            data = data.copy()
            data['expense_date'] = data['date']
        return super().to_internal_value(data)

    def validate_amount(self, value):
        if value <= Decimal('0.00'):
            raise serializers.ValidationError("Expense amount must be greater than zero.")
        return value
    def validate_category(self, value):
        valid_categories = [c.value for c in ExpenseCategory]
        if value not in valid_categories:
            raise serializers.ValidationError(
                f"Invalid category '{value}'. Valid choices are: {valid_categories}"
            )
        return value

    def validate_status(self, value):
        valid_statuses = [s.value for s in ExpenseStatus]
        if value not in valid_statuses:
            raise serializers.ValidationError(
                f"Invalid status '{value}'. Valid choices are: {valid_statuses}"
            )
        return value
