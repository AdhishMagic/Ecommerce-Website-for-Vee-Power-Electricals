from decimal import Decimal, InvalidOperation
from django.db import models
from django.db.models import Q
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.users.permissions import IsAdminUser
from .models import (
    Category,
    Subcategory,
    Brand,
    Product,
    ProductImage,
    ProductSpecification,
)
from .serializers import (
    CategorySerializer,
    SubcategorySerializer,
    BrandSerializer,
    ProductImageSerializer,
    ProductSpecificationSerializer,
    ProductListSerializer,
    ProductDetailSerializer,
    ProductAdminCreateUpdateSerializer,
)


class CategoryViewSet(viewsets.ModelViewSet):
    """
    Public catalog categories and admin category management.
    """
    queryset = Category.objects.all()
    serializer_class = CategorySerializer

    def get_permissions(self):
        if self.action in ['list', 'retrieve', 'hero']:
            return [AllowAny()]
        return [IsAdminUser()]

    def get_queryset(self):
        qs = Category.objects.all()
        # For unauthenticated or non-admin users, show only active categories
        if not (self.request.user and self.request.user.is_authenticated and (self.request.user.is_staff or getattr(self.request.user, 'role', '') == 'admin')):
            qs = qs.filter(is_active=True)

        show_in_hero = self.request.query_params.get('show_in_hero')
        if show_in_hero is not None:
            qs = qs.filter(show_in_hero=show_in_hero.lower() in ('true', '1', 't'))
        return qs

    @action(detail=False, methods=['get'])
    def hero(self, request):
        categories = Category.objects.filter(is_active=True, show_in_hero=True).order_by('hero_order')
        serializer = self.get_serializer(categories, many=True)
        return Response({'count': categories.count(), 'results': serializer.data})


class SubcategoryViewSet(viewsets.ModelViewSet):
    """
    Public subcategories and admin subcategory management.
    """
    queryset = Subcategory.objects.all()
    serializer_class = SubcategorySerializer

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [AllowAny()]
        return [IsAdminUser()]

    def get_queryset(self):
        qs = Subcategory.objects.all()
        if not (self.request.user and self.request.user.is_authenticated and (self.request.user.is_staff or getattr(self.request.user, 'role', '') == 'admin')):
            qs = qs.filter(is_active=True)

        category = self.request.query_params.get('category')
        if category:
            if category.isdigit():
                qs = qs.filter(category_id=int(category))
            else:
                qs = qs.filter(category__slug=category)
        return qs


class BrandViewSet(viewsets.ModelViewSet):
    """
    Public brands directory and admin brand management.
    """
    queryset = Brand.objects.all()
    serializer_class = BrandSerializer

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [AllowAny()]
        return [IsAdminUser()]

    def get_queryset(self):
        qs = Brand.objects.all()
        if not (self.request.user and self.request.user.is_authenticated and (self.request.user.is_staff or getattr(self.request.user, 'role', '') == 'admin')):
            qs = qs.filter(is_active=True)
        return qs


class ProductViewSet(viewsets.ModelViewSet):
    """
    Master catalog product endpoints with rich filtering, search, and protected stock deletion safety.
    """
    queryset = Product.objects.select_related('category', 'subcategory', 'brand').prefetch_related('images', 'specifications')

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [AllowAny()]
        return [IsAdminUser()]

    def get_serializer_class(self):
        if self.action == 'list':
            return ProductListSerializer
        elif self.action == 'retrieve':
            return ProductDetailSerializer
        return ProductAdminCreateUpdateSerializer

    def get_queryset(self):
        qs = Product.objects.select_related('category', 'subcategory', 'brand').prefetch_related('images', 'specifications')
        is_admin_user = (
            self.request.user
            and self.request.user.is_authenticated
            and (self.request.user.is_staff or getattr(self.request.user, 'role', '') == 'admin')
        )

        # Public users see strictly active merchandise
        if not is_admin_user:
            qs = qs.filter(active=True)
        else:
            active_param = self.request.query_params.get('active')
            if active_param is not None:
                qs = qs.filter(active=active_param.lower() in ('true', '1', 't'))

        # Filtering: Category
        category = self.request.query_params.get('category')
        if category:
            if category.isdigit():
                qs = qs.filter(category_id=int(category))
            else:
                qs = qs.filter(category__slug=category)

        category_slug = self.request.query_params.get('category_slug')
        if category_slug:
            qs = qs.filter(category__slug=category_slug)

        # Filtering: Brand
        brand = self.request.query_params.get('brand')
        if brand:
            if brand.isdigit():
                qs = qs.filter(brand_id=int(brand))
            else:
                qs = qs.filter(brand__slug=brand)

        brand_slug = self.request.query_params.get('brand_slug')
        if brand_slug:
            qs = qs.filter(brand__slug=brand_slug)

        # Filtering: Price range
        min_price = self.request.query_params.get('min_price')
        if min_price:
            try:
                qs = qs.filter(price__gte=Decimal(min_price))
            except (InvalidOperation, ValueError):
                pass

        max_price = self.request.query_params.get('max_price')
        if max_price:
            try:
                qs = qs.filter(price__lte=Decimal(max_price))
            except (InvalidOperation, ValueError):
                pass

        # Filtering: Featured
        featured = self.request.query_params.get('featured')
        if featured is not None:
            qs = qs.filter(featured=featured.lower() in ('true', '1', 't'))

        # Search keyword: `q` or `search`
        search_query = self.request.query_params.get('q') or self.request.query_params.get('search')
        if search_query:
            qs = qs.filter(
                Q(name__icontains=search_query) |
                Q(sku__icontains=search_query) |
                Q(description__icontains=search_query)
            )

        # Ordering
        ordering = self.request.query_params.get('ordering')
        valid_orderings = {
            'price': 'price',
            '-price': '-price',
            'name': 'name',
            '-name': '-name',
            'created_at': 'created_at',
            '-created_at': '-created_at',
        }
        if ordering in valid_orderings:
            qs = qs.order_by(valid_orderings[ordering])

        return qs

    def destroy(self, request, *args, **kwargs):
        """
        Safely handle product deletion. If product is protected by stock ledger entries,
        soft-deactivate it instead of throwing an unhandled database exception.
        """
        product = self.get_object()
        try:
            return super().destroy(request, *args, **kwargs)
        except models.ProtectedError:
            product.active = False
            product.save()
            return Response(
                {
                    "detail": "Product cannot be permanently deleted because it has historical stock ledger entries. It has been deactivated instead.",
                    "deactivated": True
                },
                status=status.HTTP_200_OK
            )


class ProductImageViewSet(viewsets.ModelViewSet):
    """
    Product gallery image management.
    """
    queryset = ProductImage.objects.all()
    serializer_class = ProductImageSerializer

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [AllowAny()]
        return [IsAdminUser()]

    def get_queryset(self):
        qs = ProductImage.objects.all()
        product_id = self.request.query_params.get('product')
        if product_id:
            qs = qs.filter(product_id=product_id)
        return qs


class ProductSpecificationViewSet(viewsets.ModelViewSet):
    """
    Product technical specification key-value management.
    """
    queryset = ProductSpecification.objects.all()
    serializer_class = ProductSpecificationSerializer

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [AllowAny()]
        return [IsAdminUser()]

    def get_queryset(self):
        qs = ProductSpecification.objects.all()
        product_id = self.request.query_params.get('product')
        if product_id:
            qs = qs.filter(product_id=product_id)
        return qs
