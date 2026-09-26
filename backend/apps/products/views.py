from decimal import Decimal, InvalidOperation
from django.db import models
from django.db.models import Q
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound
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
        qs = Category.objects.prefetch_related('subcategories')
        # For unauthenticated or non-admin users, show only active categories
        if not (self.request.user and self.request.user.is_authenticated and (self.request.user.is_staff or getattr(self.request.user, 'role', '') == 'admin')):
            qs = qs.filter(is_active=True)

        show_in_hero = self.request.query_params.get('show_in_hero')
        if show_in_hero is not None:
            qs = qs.filter(show_in_hero=show_in_hero.lower() in ('true', '1', 't'))
        return qs

    def get_object(self):
        lookup_url_kwarg = self.lookup_url_kwarg or self.lookup_field
        lookup_val = self.kwargs[lookup_url_kwarg]
        queryset = self.filter_queryset(self.get_queryset())
        if str(lookup_val).isdigit():
            obj = queryset.filter(id=int(lookup_val)).first()
        else:
            obj = queryset.filter(slug=lookup_val).first()
        if not obj:
            raise NotFound("Category not found.")
        self.check_object_permissions(self.request, obj)
        return obj

    @action(detail=False, methods=['get'])
    def hero(self, request):
        categories = Category.objects.filter(is_active=True, show_in_hero=True).order_by('hero_order')
        serializer = self.get_serializer(categories, many=True)
        return Response({'count': categories.count(), 'results': serializer.data})

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.products.exists():
            instance.is_active = False
            instance.save()
            return Response(
                {"detail": "Category cannot be deleted because it is referenced by existing products. It has been deactivated instead.", "deactivated": True},
                status=status.HTTP_200_OK
            )
        try:
            return super().destroy(request, *args, **kwargs)
        except models.ProtectedError:
            instance.is_active = False
            instance.save()
            return Response(
                {"detail": "Category cannot be deleted because it is referenced by existing records. It has been deactivated instead.", "deactivated": True},
                status=status.HTTP_200_OK
            )


class SubcategoryViewSet(viewsets.ModelViewSet):
    """
    Public subcategories and admin subcategory management.
    """
    queryset = Subcategory.objects.select_related('category')
    serializer_class = SubcategorySerializer

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [AllowAny()]
        return [IsAdminUser()]

    def get_queryset(self):
        qs = Subcategory.objects.select_related('category')
        if not (self.request.user and self.request.user.is_authenticated and (self.request.user.is_staff or getattr(self.request.user, 'role', '') == 'admin')):
            qs = qs.filter(is_active=True)

        category = self.request.query_params.get('category')
        if category:
            if category.isdigit():
                qs = qs.filter(category_id=int(category))
            else:
                qs = qs.filter(category__slug=category)
        return qs

    def get_object(self):
        lookup_url_kwarg = self.lookup_url_kwarg or self.lookup_field
        lookup_val = self.kwargs[lookup_url_kwarg]
        queryset = self.filter_queryset(self.get_queryset())
        if str(lookup_val).isdigit():
            obj = queryset.filter(id=int(lookup_val)).first()
        else:
            obj = queryset.filter(slug=lookup_val).first()
        if not obj:
            raise NotFound("Subcategory not found.")
        self.check_object_permissions(self.request, obj)
        return obj

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.products.exists():
            instance.is_active = False
            instance.save()
            return Response(
                {"detail": "Subcategory cannot be deleted because it is referenced by existing products. It has been deactivated instead.", "deactivated": True},
                status=status.HTTP_200_OK
            )
        return super().destroy(request, *args, **kwargs)


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

    def get_object(self):
        lookup_url_kwarg = self.lookup_url_kwarg or self.lookup_field
        lookup_val = self.kwargs[lookup_url_kwarg]
        queryset = self.filter_queryset(self.get_queryset())
        if str(lookup_val).isdigit():
            obj = queryset.filter(id=int(lookup_val)).first()
        else:
            obj = queryset.filter(slug=lookup_val).first()
        if not obj:
            raise NotFound("Brand not found.")
        self.check_object_permissions(self.request, obj)
        return obj

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.products.exists():
            instance.is_active = False
            instance.save()
            return Response(
                {"detail": "Brand cannot be deleted because it is referenced by existing products. It has been deactivated instead.", "deactivated": True},
                status=status.HTTP_200_OK
            )
        try:
            return super().destroy(request, *args, **kwargs)
        except models.ProtectedError:
            instance.is_active = False
            instance.save()
            return Response(
                {"detail": "Brand cannot be deleted because it is referenced by existing records. It has been deactivated instead.", "deactivated": True},
                status=status.HTTP_200_OK
            )


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

        # Filtering: Subcategory
        subcategory = self.request.query_params.get('subcategory')
        if subcategory:
            if subcategory.isdigit():
                qs = qs.filter(subcategory_id=int(subcategory))
            else:
                qs = qs.filter(subcategory__slug=subcategory)

        subcategory_slug = self.request.query_params.get('subcategory_slug')
        if subcategory_slug:
            qs = qs.filter(subcategory__slug=subcategory_slug)

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

        # Filtering: Availability / Stock
        in_stock_param = self.request.query_params.get('in_stock')
        if in_stock_param is not None:
            if in_stock_param.lower() in ('true', '1', 't'):
                qs = qs.filter(stock__gt=0)
            elif in_stock_param.lower() in ('false', '0', 'f'):
                qs = qs.filter(stock=0)

        # Filtering: Featured
        featured = self.request.query_params.get('featured')
        if featured is not None:
            qs = qs.filter(featured=featured.lower() in ('true', '1', 't'))

        # Search keyword: `q` or `search`
        search_query = self.request.query_params.get('q') or self.request.query_params.get('search')
        if search_query:
            search_query = search_query.strip()
            if search_query:
                qs = qs.filter(
                    Q(name__icontains=search_query) |
                    Q(sku__icontains=search_query) |
                    Q(brand__name__icontains=search_query) |
                    Q(category__name__icontains=search_query) |
                    Q(subcategory__name__icontains=search_query) |
                    Q(description__icontains=search_query)
                )

        # Ordering
        ordering = self.request.query_params.get('ordering')
        valid_orderings = {
            'price': ('price', '-id'),
            '-price': ('-price', '-id'),
            'name': ('name', '-id'),
            '-name': ('-name', '-id'),
            'created_at': ('created_at', '-id'),
            '-created_at': ('-created_at', '-id'),
            'updated_at': ('updated_at', '-id'),
            '-updated_at': ('-updated_at', '-id'),
        }
        if ordering in valid_orderings:
            qs = qs.order_by(*valid_orderings[ordering])
        else:
            qs = qs.order_by('-created_at', '-id')

        return qs

    def get_object(self):
        lookup_url_kwarg = self.lookup_url_kwarg or self.lookup_field
        lookup_val = self.kwargs[lookup_url_kwarg]
        queryset = self.filter_queryset(self.get_queryset())
        if str(lookup_val).isdigit():
            obj = queryset.filter(id=int(lookup_val)).first()
        else:
            obj = queryset.filter(slug=lookup_val).first()
        if not obj:
            raise NotFound("Product not found.")
        self.check_object_permissions(self.request, obj)
        return obj

    def destroy(self, request, *args, **kwargs):
        """
        Safely handle product deletion. If product is protected by stock ledger entries,
        order items, invoice items, or quotation items, soft-deactivate it instead of throwing
        an unhandled database exception or orphaning historical audit records.
        """
        product = self.get_object()
        has_orders = product.orderitem_set.exists() if hasattr(product, 'orderitem_set') else False
        has_invoices = product.invoiceitem_set.exists() if hasattr(product, 'invoiceitem_set') else False
        has_quotations = product.quotationitem_set.exists() if hasattr(product, 'quotationitem_set') else False
        has_stock = product.stock_transactions.exists() if hasattr(product, 'stock_transactions') else False

        if has_orders or has_invoices or has_quotations or has_stock:
            product.active = False
            product.save()
            return Response(
                {
                    "detail": "Product cannot be permanently deleted because it has historical financial or inventory records. It has been deactivated instead.",
                    "deactivated": True
                },
                status=status.HTTP_200_OK
            )

        try:
            return super().destroy(request, *args, **kwargs)
        except models.ProtectedError:
            product.active = False
            product.save()
            return Response(
                {
                    "detail": "Product cannot be permanently deleted because it has historical records. It has been deactivated instead.",
                    "deactivated": True
                },
                status=status.HTTP_200_OK
            )


class ProductImageViewSet(viewsets.ModelViewSet):
    """
    Product gallery image management.
    """
    queryset = ProductImage.objects.select_related('product')
    serializer_class = ProductImageSerializer

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [AllowAny()]
        return [IsAdminUser()]

    def get_queryset(self):
        qs = ProductImage.objects.select_related('product')
        # Inactive products do not expose images to public users
        if not (self.request.user and self.request.user.is_authenticated and (self.request.user.is_staff or getattr(self.request.user, 'role', '') == 'admin')):
            qs = qs.filter(product__active=True)
        product_id = self.request.query_params.get('product') or self.request.query_params.get('product_id')
        if product_id:
            qs = qs.filter(product_id=product_id)
        return qs


class ProductSpecificationViewSet(viewsets.ModelViewSet):
    """
    Product technical specification key-value management.
    """
    queryset = ProductSpecification.objects.select_related('product')
    serializer_class = ProductSpecificationSerializer

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [AllowAny()]
        return [IsAdminUser()]

    def get_queryset(self):
        qs = ProductSpecification.objects.select_related('product')
        # Inactive products do not expose specifications to public users
        if not (self.request.user and self.request.user.is_authenticated and (self.request.user.is_staff or getattr(self.request.user, 'role', '') == 'admin')):
            qs = qs.filter(product__active=True)
        product_id = self.request.query_params.get('product') or self.request.query_params.get('product_id')
        if product_id:
            qs = qs.filter(product_id=product_id)
        return qs

