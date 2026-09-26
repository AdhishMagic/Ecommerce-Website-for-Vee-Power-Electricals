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
    Expense,
    ExpenseCategory,
    ExpenseStatus,
)


class ClientSerializer(serializers.ModelSerializer):
    class Meta:
        model = Client
        fields = [
            'id', 'client_code', 'company_name', 'contact_person',
            'gstin', 'email', 'phone', 'credit_limit', 'address',
            'is_active', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


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
