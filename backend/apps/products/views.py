from decimal import Decimal, InvalidOperation
from django.core.cache import cache
from django.db import models, transaction
from django.db.models import Q
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound
from rest_framework.permissions import AllowAny
from rest_framework.parsers import JSONParser, MultiPartParser, FormParser
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
from .cache_utils import (
    CACHE_KEY_CAT_HERO,
    CACHE_KEY_CAT_LIST,
    CACHE_KEY_BRANDS_LIST,
    invalidate_catalog_cache,
    invalidate_brands_cache,
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
        qs = Category.objects.annotate(
            products_count=models.Count('products', filter=models.Q(products__active=True))
        ).prefetch_related('subcategories').order_by('id')
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

    def list(self, request, *args, **kwargs):
        is_admin = bool(
            request.user
            and request.user.is_authenticated
            and (request.user.is_staff or getattr(request.user, 'role', '') == 'admin')
        )
        show_in_hero = request.query_params.get('show_in_hero')
        is_default_public = not is_admin and show_in_hero is None

        if is_default_public:
            cached_data = cache.get(CACHE_KEY_CAT_LIST)
            if cached_data is not None:
                response = Response(cached_data)
                response['Cache-Control'] = 'public, max-age=60, s-maxage=300, stale-while-revalidate=600'
                return response

        response = super().list(request, *args, **kwargs)
        if is_default_public:
            cache.set(CACHE_KEY_CAT_LIST, response.data, timeout=300)
            response['Cache-Control'] = 'public, max-age=60, s-maxage=300, stale-while-revalidate=600'
        return response

    @action(detail=False, methods=['get'])
    def hero(self, request):
        cached_data = cache.get(CACHE_KEY_CAT_HERO)
        if cached_data is not None:
            response = Response(cached_data)
            response['Cache-Control'] = 'public, max-age=60, s-maxage=300, stale-while-revalidate=600'
            return response

        categories = Category.objects.filter(is_active=True, show_in_hero=True).order_by('hero_order')
        serializer = self.get_serializer(categories, many=True)
        data = {'count': len(serializer.data), 'results': serializer.data}
        cache.set(CACHE_KEY_CAT_HERO, data, timeout=300)
        response = Response(data)
        response['Cache-Control'] = 'public, max-age=60, s-maxage=300, stale-while-revalidate=600'
        return response

    def perform_create(self, serializer):
        super().perform_create(serializer)
        invalidate_catalog_cache()

    def perform_update(self, serializer):
        super().perform_update(serializer)
        invalidate_catalog_cache()

    def perform_destroy(self, instance):
        super().perform_destroy(instance)
        invalidate_catalog_cache()

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        invalidate_catalog_cache()
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

    def perform_create(self, serializer):
        super().perform_create(serializer)
        invalidate_catalog_cache()

    def perform_update(self, serializer):
        super().perform_update(serializer)
        invalidate_catalog_cache()

    def perform_destroy(self, instance):
        super().perform_destroy(instance)
        invalidate_catalog_cache()

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        invalidate_catalog_cache()
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

    def list(self, request, *args, **kwargs):
        is_admin = bool(
            request.user
            and request.user.is_authenticated
            and (request.user.is_staff or getattr(request.user, 'role', '') == 'admin')
        )
        if not is_admin:
            cached_data = cache.get(CACHE_KEY_BRANDS_LIST)
            if cached_data is not None:
                response = Response(cached_data)
                response['Cache-Control'] = 'public, max-age=60, s-maxage=300, stale-while-revalidate=600'
                return response

        response = super().list(request, *args, **kwargs)
        if not is_admin:
            cache.set(CACHE_KEY_BRANDS_LIST, response.data, timeout=300)
            response['Cache-Control'] = 'public, max-age=60, s-maxage=300, stale-while-revalidate=600'
        return response

    def perform_create(self, serializer):
        super().perform_create(serializer)
        invalidate_brands_cache()

    def perform_update(self, serializer):
        super().perform_update(serializer)
        invalidate_brands_cache()

    def perform_destroy(self, instance):
        super().perform_destroy(instance)
        invalidate_brands_cache()

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        invalidate_brands_cache()
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
    queryset = Product.objects.select_related('category', 'subcategory', 'brand')
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_permissions(self):
        if self.action in ['list', 'retrieve', 'default_images', 'bulk_import_template']:
            return [AllowAny()]
        return [IsAdminUser()]

    def get_serializer_class(self):
        if self.action == 'list':
            return ProductListSerializer
        elif self.action == 'retrieve':
            return ProductDetailSerializer
        return ProductAdminCreateUpdateSerializer

    def get_queryset(self):
        qs = Product.objects.select_related('category', 'subcategory', 'brand')
        if getattr(self, 'action', None) in ['retrieve', 'default_images'] or getattr(self, 'detail', False):
            qs = qs.prefetch_related('images', 'specifications')
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
                qs = qs.filter(Q(category__slug__iexact=category) | Q(category__name__iexact=category))

        category_slug = self.request.query_params.get('category_slug')
        if category_slug:
            qs = qs.filter(category__slug__iexact=category_slug)

        # Filtering: Subcategory
        subcategory = self.request.query_params.get('subcategory')
        if subcategory:
            if subcategory.isdigit():
                qs = qs.filter(subcategory_id=int(subcategory))
            else:
                qs = qs.filter(Q(subcategory__slug__iexact=subcategory) | Q(subcategory__name__iexact=subcategory))

        subcategory_slug = self.request.query_params.get('subcategory_slug')
        if subcategory_slug:
            qs = qs.filter(subcategory__slug__iexact=subcategory_slug)

        # Filtering: Brand
        brand = self.request.query_params.get('brand')
        if brand:
            if brand.isdigit():
                qs = qs.filter(brand_id=int(brand))
            else:
                qs = qs.filter(Q(brand__slug__iexact=brand) | Q(brand__name__iexact=brand))

        brand_slug = self.request.query_params.get('brand_slug')
        if brand_slug:
            qs = qs.filter(brand__slug__iexact=brand_slug)

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

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        if not (request.user and request.user.is_authenticated and (request.user.is_staff or getattr(request.user, 'role', '') == 'admin')):
            response['Cache-Control'] = 'public, max-age=30, s-maxage=120, stale-while-revalidate=300'
        return response

    def retrieve(self, request, *args, **kwargs):
        response = super().retrieve(request, *args, **kwargs)
        if not (request.user and request.user.is_authenticated and (request.user.is_staff or getattr(request.user, 'role', '') == 'admin')):
            response['Cache-Control'] = 'public, max-age=60, s-maxage=300, stale-while-revalidate=600'
        return response

    def perform_create(self, serializer):
        super().perform_create(serializer)
        invalidate_catalog_cache()

    def perform_update(self, serializer):
        super().perform_update(serializer)
        invalidate_catalog_cache()

    def perform_destroy(self, instance):
        super().perform_destroy(instance)
        invalidate_catalog_cache()

    def destroy(self, request, *args, **kwargs):
        """
        Safely handle product deletion. If product is protected by stock ledger entries,
        order items, invoice items, or quotation items, soft-deactivate it instead of throwing
        an unhandled database exception or orphaning historical audit records.
        """
        invalidate_catalog_cache()
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

    @action(
        detail=False,
        methods=['post'],
        url_path='upload-image',
        permission_classes=[IsAdminUser],
        parser_classes=[MultiPartParser, FormParser]
    )
    def upload_image(self, request):
        """
        Secure administrator product image upload.
        Validates content using Pillow, enforces 5MB size limit, accepts JPEG/PNG/WebP,
        and saves with safe UUID filenames into media/products/.
        """
        uploaded_file = request.FILES.get('file') or request.FILES.get('image')
        if not uploaded_file:
            return Response(
                {"detail": "No image file provided. Please attach a file under 'file' or 'image'."},
                status=status.HTTP_400_BAD_REQUEST
            )

        max_size = 5 * 1024 * 1024  # 5 MB
        if uploaded_file.size > max_size:
            return Response(
                {"detail": f"File size ({uploaded_file.size / 1024 / 1024:.2f}MB) exceeds the maximum allowed limit of 5MB."},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            from PIL import Image
            uploaded_file.seek(0)
            img = Image.open(uploaded_file)
            img.verify()
            img_format = (img.format or '').upper()
        except Exception:
            return Response(
                {"detail": "Invalid or corrupted image file. Please upload a valid JPEG, PNG, or WebP image."},
                status=status.HTTP_400_BAD_REQUEST
            )

        allowed_formats = {'JPEG': 'jpg', 'PNG': 'png', 'WEBP': 'webp'}
        if img_format not in allowed_formats:
            return Response(
                {"detail": f"Unsupported image format: {img_format}. Allowed formats are JPEG, PNG, and WebP."},
                status=status.HTTP_400_BAD_REQUEST
            )

        import uuid
        from pathlib import Path
        from django.conf import settings

        ext = allowed_formats[img_format]
        filename = f"{uuid.uuid4().hex}.{ext}"
        media_dir = Path(settings.MEDIA_ROOT) / 'products'
        media_dir.mkdir(parents=True, exist_ok=True)
        file_path = media_dir / filename

        uploaded_file.seek(0)
        with open(file_path, 'wb') as destination:
            for chunk in uploaded_file.chunks():
                destination.write(chunk)

        relative_url = f"{settings.MEDIA_URL}products/{filename}"
        return Response({
            "image_url": relative_url,
            "url": relative_url,
            "filename": filename
        }, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'], url_path='default-images', permission_classes=[AllowAny])
    def default_images(self, request):
        """
        Return curated category default images with category key, display name, and URL.
        """
        defaults = [
            {"key": "fans", "name": "Fans", "image_url": "/media/defaults/fans.webp"},
            {"key": "wires-cables", "name": "Wires & Cables", "image_url": "/media/defaults/wires-cables.webp"},
            {"key": "switches", "name": "Switches", "image_url": "/media/defaults/switches.webp"},
            {"key": "modular-switches", "name": "Modular Switches", "image_url": "/media/defaults/modular-switches.webp"},
            {"key": "led-lighting", "name": "LED Lighting", "image_url": "/media/defaults/led-lighting.webp"},
            {"key": "led-luminaires", "name": "LED Luminaires", "image_url": "/media/defaults/led-luminaires.webp"},
            {"key": "lighting", "name": "Lighting", "image_url": "/media/defaults/lighting.webp"},
            {"key": "mcb-distribution", "name": "MCB & Distribution", "image_url": "/media/defaults/mcb-distribution.webp"},
            {"key": "mcb-protection", "name": "MCB & Protection", "image_url": "/media/defaults/mcb-protection.webp"},
            {"key": "electrical-accessories", "name": "Electrical Accessories", "image_url": "/media/defaults/electrical-accessories.webp"},
            {"key": "generic-electrical", "name": "Generic Electrical", "image_url": "/media/defaults/generic-electrical.webp"},
        ]
        response = Response(defaults, status=status.HTTP_200_OK)
        response['Cache-Control'] = 'public, max-age=86400, s-maxage=86400'
        return response

    @action(
        detail=False,
        methods=['get'],
        url_path='bulk-import/template',
        permission_classes=[AllowAny]
    )
    def bulk_import_template(self, request):
        """
        Download pre-formatted Excel template (.xlsx) with guidelines and sample electrical items.
        """
        from django.http import HttpResponse
        from .services_bulk_import import BulkProductImportService

        buffer = BulkProductImportService.generate_template_workbook()
        response = HttpResponse(
            buffer.getvalue(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        response['Content-Disposition'] = 'attachment; filename="VeePower_Products_Template.xlsx"'
        return response

    @action(
        detail=False,
        methods=['post'],
        url_path='bulk-import',
        permission_classes=[IsAdminUser],
        parser_classes=[MultiPartParser, FormParser, JSONParser]
    )
    def bulk_import(self, request):
        """
        High performance bulk import for product rows with atomic transaction,
        row-level validation, and detailed reporting. Accepts multipart/form-data with
        excel_file (.xlsx, .xls, .csv) and optional companion images_zip archive,
        or legacy JSON array.
        """
        excel_file = request.FILES.get('excel_file') or request.FILES.get('file')
        images_zip = request.FILES.get('images_zip') or request.FILES.get('zip_file')

        if excel_file:
            from .services_bulk_import import BulkProductImportService
            result = BulkProductImportService.process_bulk_import(excel_file, images_zip)
            return Response(result, status=status.HTTP_200_OK if result.get('success') else status.HTTP_400_BAD_REQUEST)

        rows = request.data if isinstance(request.data, list) else request.data.get('products', [])
        if not rows:
            return Response({"detail": "No Excel file (.xlsx, .csv) or product records provided for import."}, status=status.HTTP_400_BAD_REQUEST)

        created_count = 0
        updated_count = 0
        errors = []

        with transaction.atomic():
            for idx, row in enumerate(rows, start=1):
                sku = (row.get('sku') or '').strip()
                name = (row.get('name') or '').strip()
                if not sku or not name:
                    errors.append({"row": idx, "sku": sku or "N/A", "error": "Both SKU and name are required.", "reason": "Both SKU and name are required."})
                    continue

                existing_product = Product.objects.filter(sku=sku).first()
                if existing_product:
                    serializer = ProductAdminCreateUpdateSerializer(existing_product, data=row, partial=True)
                else:
                    serializer = ProductAdminCreateUpdateSerializer(data=row)

                if not serializer.is_valid():
                    errors.append({"row": idx, "sku": sku, "error": str(serializer.errors), "reason": str(serializer.errors)})
                    continue

                serializer.save()
                if existing_product:
                    updated_count += 1
                else:
                    created_count += 1

        invalidate_catalog_cache()
        invalidate_brands_cache()

        return Response({
            "success": True,
            "created": created_count,
            "updated": updated_count,
            "created_count": created_count,
            "updated_count": updated_count,
            "error_count": len(errors),
            "errors": errors,
            "total_processed": len(rows),
        }, status=status.HTTP_200_OK if not errors else status.HTTP_207_MULTI_STATUS)


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

