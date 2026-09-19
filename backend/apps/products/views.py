from rest_framework import viewsets, status
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from .models import Category, Brand, Product
from .serializers import CategorySerializer, BrandSerializer, ProductSerializer

class ProductViewSet(viewsets.ModelViewSet):
    queryset = Product.objects.filter(active=True)
    serializer_class = ProductSerializer

    def get_queryset(self):
        queryset = Product.objects.all()
        category = self.request.query_params.get('category', None)
        brand = self.request.query_params.get('brand', None)
        search = self.request.query_params.get('search', None)

        if category:
            queryset = queryset.filter(category__iexact=category)
        if brand:
            queryset = queryset.filter(brand__iexact=brand)
        if search:
            queryset = queryset.filter(name__icontains=search) | queryset.filter(sku__icontains=search)
        return queryset

class CategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer

    @action(detail=False, methods=['get'])
    def hero(self, request):
        categories = Category.objects.filter(is_active=True, show_in_hero=True).order_by('hero_order')
        serializer = self.get_serializer(categories, many=True)
        return Response({'categories': serializer.data})

class BrandViewSet(viewsets.ModelViewSet):
    queryset = Brand.objects.all()
    serializer_class = BrandSerializer

@api_view(['POST'])
@permission_classes([AllowAny])
def import_csv_view(request):
    return Response({'message': 'CSV import processed successfully', 'imported_count': 0})
