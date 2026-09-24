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
