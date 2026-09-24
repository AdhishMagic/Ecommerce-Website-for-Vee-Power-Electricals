from django.db import models, transaction
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.users.permissions import IsAdminUser
from apps.products.models import Product
from .models import StockTransaction, StockTransactionType
from .serializers import (
    InventoryProductOverviewSerializer,
    StockTransactionSerializer,
    StockRestockSerializer,
    StockAdjustmentSerializer,
)


class InventoryOverviewView(generics.ListAPIView):
    """
    GET /api/v1/inventory/
    Staff/Admin overview of stock inventory across all catalog items.
    """
    permission_classes = [IsAdminUser]
    serializer_class = InventoryProductOverviewSerializer

    def get_queryset(self):
        qs = Product.objects.select_related('brand', 'category').order_by('name')
        low_stock = self.request.query_params.get('low_stock')
        if low_stock is not None and low_stock.lower() in ('true', '1', 't'):
            qs = qs.filter(stock__lte=models.F('low_stock_threshold'))

        search = self.request.query_params.get('search') or self.request.query_params.get('q')
        if search:
            qs = qs.filter(
                models.Q(name__icontains=search) | models.Q(sku__icontains=search)
            )
        return qs


class StockTransactionListView(generics.ListAPIView):
    """
    GET /api/v1/inventory/transactions/
    Paginated immutable stock ledger transaction journal.
    """
    permission_classes = [IsAdminUser]
    serializer_class = StockTransactionSerializer

    def get_queryset(self):
        qs = StockTransaction.objects.select_related('product', 'order', 'performed_by').all()
        product_id = self.request.query_params.get('product') or self.request.query_params.get('product_id')
        if product_id:
            qs = qs.filter(product_id=product_id)

        tx_type = self.request.query_params.get('type') or self.request.query_params.get('transaction_type')
        if tx_type:
            qs = qs.filter(transaction_type=tx_type.upper())
        return qs


class StockRestockView(APIView):
    """
    POST /api/v1/inventory/restock/
    Warehouse restocking: increases product stock and appends immutable RESTOCK transaction.
    """
    permission_classes = [IsAdminUser]

    @transaction.atomic
    def post(self, request):
        serializer = StockRestockSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        product_id = serializer.validated_data['product_id']
        quantity = serializer.validated_data['quantity']
        notes = serializer.validated_data.get('notes', '')

        product = Product.objects.select_for_update().get(id=product_id)
        product.stock += quantity
        product.save()

        tx = StockTransaction.objects.create(
            product=product,
            change_amount=quantity,
            transaction_type=StockTransactionType.RESTOCK,
            performed_by=request.user,
            notes=notes or f"Restocked {quantity} units"
        )

        return Response(
            {
                "message": f"Successfully restocked {quantity} units of {product.name}.",
                "product_id": product.id,
                "current_stock": product.stock,
                "transaction": StockTransactionSerializer(tx).data,
            },
            status=status.HTTP_201_CREATED,
        )


class StockAdjustmentView(APIView):
    """
    POST /api/v1/inventory/adjust/
    Inventory adjustment: handles damage, write-offs, or audit reconciliations.
    """
    permission_classes = [IsAdminUser]

    @transaction.atomic
    def post(self, request):
        serializer = StockAdjustmentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        product_id = serializer.validated_data['product_id']
        change_amount = serializer.validated_data['change_amount']
        notes = serializer.validated_data.get('notes', '')

        product = Product.objects.select_for_update().get(id=product_id)
        if product.stock + change_amount < 0:
            return Response(
                {"detail": f"Insufficient stock. Available: {product.stock}, cannot adjust by {change_amount}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        product.stock += change_amount
        product.save()

        tx = StockTransaction.objects.create(
            product=product,
            change_amount=change_amount,
            transaction_type=StockTransactionType.ADJUSTMENT,
            performed_by=request.user,
            notes=notes or f"Inventory adjustment of {change_amount} units"
        )

        return Response(
            {
                "message": f"Successfully adjusted stock by {change_amount} units for {product.name}.",
                "product_id": product.id,
                "current_stock": product.stock,
                "transaction": StockTransactionSerializer(tx).data,
            },
            status=status.HTTP_201_CREATED,
        )
