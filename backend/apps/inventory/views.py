from django.db import models, transaction
from django.core.exceptions import ValidationError as DjangoValidationError
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
from apps.inventory.services import InventoryService


class InventoryOverviewView(generics.ListAPIView):
    """
    GET /api/v1/inventory/
    Staff/Admin overview of stock inventory across all catalog items with filtering.
    """
    permission_classes = [IsAdminUser]
    serializer_class = InventoryProductOverviewSerializer

    def get_queryset(self):
        qs = Product.objects.select_related('brand', 'category').order_by('name', 'id')

        # Low stock filter
        low_stock = self.request.query_params.get('low_stock')
        if low_stock is not None and low_stock.lower() in ('true', '1', 't'):
            qs = qs.filter(stock__lte=models.F('low_stock_threshold'))

        # Active status filter
        active_param = self.request.query_params.get('active')
        if active_param is not None:
            if active_param.lower() in ('true', '1', 't'):
                qs = qs.filter(active=True)
            elif active_param.lower() in ('false', '0', 'f'):
                qs = qs.filter(active=False)

        # Category filter (safe integer)
        category_param = self.request.query_params.get('category') or self.request.query_params.get('category_id')
        if category_param:
            try:
                qs = qs.filter(category_id=int(category_param))
            except (ValueError, TypeError):
                qs = qs.none()

        # Brand filter (safe integer)
        brand_param = self.request.query_params.get('brand') or self.request.query_params.get('brand_id')
        if brand_param:
            try:
                qs = qs.filter(brand_id=int(brand_param))
            except (ValueError, TypeError):
                qs = qs.none()

        # Search filter (name or sku)
        search = self.request.query_params.get('search') or self.request.query_params.get('q')
        if search:
            search = search.strip()
            qs = qs.filter(
                models.Q(name__icontains=search) | models.Q(sku__icontains=search)
            )

        return qs


class StockTransactionListView(generics.ListAPIView):
    """
    GET /api/v1/inventory/transactions/
    Paginated immutable stock ledger transaction journal with comprehensive audit filters.
    """
    permission_classes = [IsAdminUser]
    serializer_class = StockTransactionSerializer

    def get_queryset(self):
        qs = StockTransaction.objects.select_related('product', 'order', 'performed_by').order_by('-created_at', '-id')

        # Product filter
        product_param = self.request.query_params.get('product') or self.request.query_params.get('product_id')
        if product_param:
            try:
                qs = qs.filter(product_id=int(product_param))
            except (ValueError, TypeError):
                qs = qs.none()

        # Transaction type filter
        tx_type = self.request.query_params.get('type') or self.request.query_params.get('transaction_type')
        if tx_type:
            cleaned_type = tx_type.upper().strip()
            if cleaned_type in dict(StockTransactionType.choices):
                qs = qs.filter(transaction_type=cleaned_type)
            else:
                qs = qs.none()

        # Order reference filter
        order_param = self.request.query_params.get('order') or self.request.query_params.get('order_id')
        if order_param:
            try:
                qs = qs.filter(order_id=int(order_param))
            except (ValueError, TypeError):
                qs = qs.none()

        # Performed by user filter
        user_param = self.request.query_params.get('user') or self.request.query_params.get('performed_by')
        if user_param:
            try:
                qs = qs.filter(performed_by_id=int(user_param))
            except (ValueError, TypeError):
                qs = qs.none()

        # Date range filters (YYYY-MM-DD)
        date_from = self.request.query_params.get('date_from') or self.request.query_params.get('start_date')
        if date_from:
            qs = qs.filter(created_at__date__gte=date_from)

        date_to = self.request.query_params.get('date_to') or self.request.query_params.get('end_date')
        if date_to:
            qs = qs.filter(created_at__date__lte=date_to)

        return qs


class StockLedgerSummaryView(APIView):
    """
    GET /api/v1/inventory/summary/<product_id>/
    Staff/Admin audit view of physical ledger movements and net reconciliation.
    """
    permission_classes = [IsAdminUser]

    def get(self, request, product_id):
        try:
            summary = InventoryService.get_ledger_summary(product_id=int(product_id))
            return Response(summary, status=status.HTTP_200_OK)
        except Product.DoesNotExist:
            return Response({"detail": "Product not found."}, status=status.HTTP_404_NOT_FOUND)
        except (ValueError, TypeError):
            return Response({"detail": "Invalid product ID."}, status=status.HTTP_400_BAD_REQUEST)


class StockRestockView(APIView):
    """
    POST /api/v1/inventory/restock/
    Warehouse restocking: increases product stock and appends immutable RESTOCK transaction.
    Delegates to InventoryService.
    """
    permission_classes = [IsAdminUser]

    @transaction.atomic
    def post(self, request):
        serializer = StockRestockSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        product_id = serializer.validated_data['product_id']
        quantity = serializer.validated_data['quantity']
        notes = serializer.validated_data.get('notes', '')

        try:
            product, tx = InventoryService.restock_product(
                product_id=product_id,
                quantity=quantity,
                performed_by=request.user,
                notes=notes
            )
            return Response(
                {
                    "message": f"Successfully restocked {quantity} units of {product.name}.",
                    "product_id": product.id,
                    "stock": product.stock,
                    "current_stock": product.stock,
                    "transaction": StockTransactionSerializer(tx).data,
                },
                status=status.HTTP_201_CREATED,
            )
        except DjangoValidationError as e:
            msg = e.message if hasattr(e, 'message') else str(e)
            return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)


class StockAdjustmentView(APIView):
    """
    POST /api/v1/inventory/adjust/
    Inventory adjustment: handles damage, write-offs, or audit reconciliations.
    Delegates to InventoryService.
    """
    permission_classes = [IsAdminUser]

    @transaction.atomic
    def post(self, request):
        serializer = StockAdjustmentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        product_id = serializer.validated_data['product_id']
        change_amount = serializer.validated_data['change_amount']
        notes = serializer.validated_data.get('notes', '')

        try:
            product, tx = InventoryService.adjust_stock(
                product_id=product_id,
                change_amount=change_amount,
                performed_by=request.user,
                notes=notes
            )
            return Response(
                {
                    "message": f"Successfully adjusted stock by {change_amount} units for {product.name}.",
                    "product_id": product.id,
                    "stock": product.stock,
                    "current_stock": product.stock,
                    "transaction": StockTransactionSerializer(tx).data,
                },
                status=status.HTTP_201_CREATED,
            )
        except DjangoValidationError as e:
            msg = e.message if hasattr(e, 'message') else str(e)
            return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)
