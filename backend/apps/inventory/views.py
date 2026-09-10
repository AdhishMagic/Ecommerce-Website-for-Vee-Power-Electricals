from rest_framework import viewsets, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from apps.products.models import Product
from .models import StockTransaction
from .serializers import StockTransactionSerializer

class InventoryViewSet(viewsets.ViewSet):
    def list(self, request):
        products = Product.objects.all()
        inventory_items = []
        for p in products:
            inventory_items.append({
                'id': str(p.id),
                'sku': p.sku,
                'productName': p.name,
                'brand': p.brand,
                'category': p.category,
                'currentStock': p.stock,
                'lowStockThreshold': p.low_stock_threshold,
                'lastUpdated': p.updated_at.isoformat() if hasattr(p, 'updated_at') else None
            })
        return Response(inventory_items)

@api_view(['POST'])
@permission_classes([AllowAny])
def add_transaction_view(request, product_id):
    try:
        product = Product.objects.get(id=product_id)
    except Product.DoesNotExist:
        return Response({'message': 'Product not found'}, status=status.HTTP_404_NOT_FOUND)

    quantity = int(request.data.get('quantity', 0))
    trans_type = request.data.get('type', 'RESTOCK')
    notes = request.data.get('notes', '')

    if trans_type in ('RESTOCK', 'RETURN'):
        product.stock += quantity
    elif trans_type in ('SALE', 'ADJUSTMENT'):
        product.stock -= quantity
    product.save()

    transaction = StockTransaction.objects.create(
        product=product,
        change_amount=quantity,
        transaction_type=trans_type,
        notes=notes
    )
    serializer = StockTransactionSerializer(transaction)
    return Response(serializer.data, status=status.HTTP_201_CREATED)
