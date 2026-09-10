import random
from rest_framework import viewsets, status
from rest_framework.response import Response
from .models import Order, OrderItem
from .serializers import OrderSerializer

class OrderViewSet(viewsets.ModelViewSet):
    queryset = Order.objects.all().order_by('-created_at')
    serializer_class = OrderSerializer

    def create(self, request, *args, **kwargs):
        data = request.data
        order_number = f"VPE-{random.randint(100000, 999999)}"
        order = Order.objects.create(
            order_number=order_number,
            customer_name=data.get('customerName', 'Guest Customer'),
            customer_email=data.get('customerEmail', ''),
            customer_phone=data.get('customerPhone', ''),
            shipping_address=data.get('shippingAddress', {}),
            total_amount=data.get('totalAmount', 0.00),
            tax_amount=data.get('taxAmount', 0.00),
            shipping_fee=data.get('shippingFee', 0.00),
            payment_method=data.get('paymentMethod', 'UPI'),
            status='Pending',
            payment_status='Paid'
        )

        for item in data.get('items', []):
            OrderItem.objects.create(
                order=order,
                product_name=item.get('name', 'Product'),
                price=item.get('price', 0.00),
                quantity=item.get('quantity', 1),
                subtotal=float(item.get('price', 0.00)) * int(item.get('quantity', 1))
            )

        serializer = self.get_serializer(order)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
