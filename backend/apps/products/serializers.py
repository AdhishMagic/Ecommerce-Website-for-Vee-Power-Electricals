from rest_framework import serializers
from .models import (
    Category,
    Subcategory,
    Brand,
    Product,
    ProductImage,
    ProductSpecification,
)


class CategorySerializer(serializers.ModelSerializer):
    slug = serializers.SlugField(required=False, allow_blank=True)
    is_active = serializers.BooleanField(required=False, default=True)

    class Meta:
        model = Category
        fields = [
            'id', 'name', 'slug', 'icon', 'image', 'subtitle',
            'hero_order', 'hero_badge', 'show_in_hero',
            'discount_enabled', 'discount_type', 'discount_value',
            'discount_label', 'is_active', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def to_internal_value(self, data):
        data = data.copy() if hasattr(data, 'copy') else dict(data)
        if not data.get('slug') and data.get('name'):
            from django.utils.text import slugify
            data['slug'] = slugify(data['name'])
        return super().to_internal_value(data)

    def validate_name(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError("Category name cannot be blank.")
        return value.strip()

    def validate(self, data):
        discount_value = data.get('discount_value', getattr(self.instance, 'discount_value', 0))
        discount_type = data.get('discount_type', getattr(self.instance, 'discount_type', 'percentage'))

        if discount_value is not None and discount_value < 0:
            raise serializers.ValidationError({"discount_value": "Discount value cannot be negative."})
        if discount_type == 'percentage' and discount_value is not None and discount_value > 100:
            raise serializers.ValidationError({"discount_value": "Percentage discount cannot exceed 100%."})
        return data


class SubcategorySerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    slug = serializers.SlugField(required=False, allow_blank=True)
    is_active = serializers.BooleanField(required=False, default=True)

    class Meta:
        model = Subcategory
        fields = [
            'id', 'category', 'category_name', 'name', 'slug',
            'description', 'display_order', 'is_active', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def to_internal_value(self, data):
        data = data.copy() if hasattr(data, 'copy') else dict(data)
        if not data.get('slug') and data.get('name'):
            from django.utils.text import slugify
            data['slug'] = slugify(data['name'])
        return super().to_internal_value(data)

    def validate_name(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError("Subcategory name cannot be blank.")
        return value.strip()


class BrandSerializer(serializers.ModelSerializer):
    slug = serializers.SlugField(required=False, allow_blank=True)
    is_active = serializers.BooleanField(required=False, default=True)

    class Meta:
        model = Brand
        fields = [
            'id', 'name', 'slug', 'logo_url', 'description',
            'is_active', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def to_internal_value(self, data):
        data = data.copy() if hasattr(data, 'copy') else dict(data)
        if not data.get('slug') and data.get('name'):
            from django.utils.text import slugify
            data['slug'] = slugify(data['name'])
        return super().to_internal_value(data)

    def validate_name(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError("Brand name cannot be blank.")
        return value.strip()


class ProductImageSerializer(serializers.ModelSerializer):
    image = serializers.CharField(source='image_url', read_only=True)

    class Meta:
        model = ProductImage
        fields = ['id', 'product', 'image_url', 'image', 'alt_text', 'sort_order', 'is_primary', 'created_at']
        read_only_fields = ['id', 'created_at']

    def validate_image_url(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError("Image URL cannot be blank.")
        return value.strip()


class ProductSpecificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductSpecification
        fields = ['id', 'product', 'spec_key', 'spec_value', 'sort_order', 'created_at']
        read_only_fields = ['id', 'created_at']

    def validate(self, data):
        spec_key = data.get('spec_key', getattr(self.instance, 'spec_key', None))
        spec_value = data.get('spec_value', getattr(self.instance, 'spec_value', None))
        if spec_key is not None and not str(spec_key).strip():
            raise serializers.ValidationError({"spec_key": "Specification key cannot be blank."})
        if spec_value is not None and not str(spec_value).strip():
            raise serializers.ValidationError({"spec_value": "Specification value cannot be blank."})
        return data


class ProductListSerializer(serializers.ModelSerializer):
    category = serializers.SerializerMethodField()
    subcategory = serializers.SerializerMethodField()
    brand = serializers.SerializerMethodField()
    in_stock = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            'id', 'name', 'slug', 'sku', 'category', 'subcategory', 'brand',
            'mrp', 'price', 'in_stock', 'primary_image', 'featured', 'active',
            'created_at'
        ]

    def get_category(self, obj):
        return {'id': obj.category.id, 'name': obj.category.name, 'slug': obj.category.slug} if obj.category else None

    def get_subcategory(self, obj):
        return {'id': obj.subcategory.id, 'name': obj.subcategory.name, 'slug': obj.subcategory.slug} if obj.subcategory else None

    def get_brand(self, obj):
        return {'id': obj.brand.id, 'name': obj.brand.name, 'slug': obj.brand.slug} if obj.brand else None

    def get_in_stock(self, obj):
        return obj.stock > 0

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Expose actual physical stock quantity only to authenticated admin/staff users
        request = self.context.get('request')
        if request and request.user and request.user.is_authenticated and (request.user.is_staff or getattr(request.user, 'role', '') == 'admin'):
            data['stock'] = instance.stock
            data['low_stock_threshold'] = instance.low_stock_threshold
        return data


class ProductDetailSerializer(ProductListSerializer):
    images = ProductImageSerializer(many=True, read_only=True)
    specifications = ProductSpecificationSerializer(many=True, read_only=True)

    class Meta(ProductListSerializer.Meta):
        fields = ProductListSerializer.Meta.fields + ['description', 'images', 'specifications']


class ProductAdminCreateUpdateSerializer(serializers.ModelSerializer):
    slug = serializers.SlugField(required=False, allow_blank=True)
    active = serializers.BooleanField(required=False, default=True)

    class Meta:
        model = Product
        fields = [
            'id', 'name', 'slug', 'sku', 'category', 'subcategory', 'brand',
            'mrp', 'price', 'stock', 'low_stock_threshold', 'description',
            'primary_image', 'featured', 'active'
        ]
        read_only_fields = ['id']

    def to_internal_value(self, data):
        data = data.copy() if hasattr(data, 'copy') else dict(data)
        if not data.get('slug') and data.get('name'):
            from django.utils.text import slugify
            data['slug'] = slugify(data['name'])

        # Default mrp to price if omitted
        if not data.get('mrp') and data.get('price'):
            data['mrp'] = data['price']

        # Map image to primary_image if passed
        if not data.get('primary_image') and data.get('image'):
            data['primary_image'] = data['image']

        # Handle uploaded file object or base64 image data URI
        img_val = data.get('primary_image')
        if img_val and hasattr(img_val, 'read'):
            import uuid
            from pathlib import Path
            from PIL import Image
            from django.conf import settings

            if getattr(img_val, 'size', 0) > 5 * 1024 * 1024:
                raise serializers.ValidationError({"primary_image": "Uploaded image file exceeds maximum 5MB size limit."})

            try:
                img_val.seek(0)
                pil_img = Image.open(img_val)
                pil_img.verify()
                fmt = (pil_img.format or '').upper()
            except Exception:
                raise serializers.ValidationError({"primary_image": "Invalid or corrupted image file. Please upload a valid JPEG, PNG, or WebP image."})

            allowed = {'JPEG': 'jpg', 'PNG': 'png', 'WEBP': 'webp'}
            if fmt not in allowed:
                raise serializers.ValidationError({"primary_image": f"Unsupported image format: {fmt}. Allowed formats: JPEG, PNG, WebP."})

            ext = allowed[fmt]
            filename = f"{uuid.uuid4().hex}.{ext}"
            media_dir = Path(settings.MEDIA_ROOT) / 'products'
            media_dir.mkdir(parents=True, exist_ok=True)
            file_path = media_dir / filename

            img_val.seek(0)
            with open(file_path, 'wb') as f:
                if hasattr(img_val, 'chunks'):
                    for chunk in img_val.chunks():
                        f.write(chunk)
                else:
                    f.write(img_val.read())

            data['primary_image'] = f"{settings.MEDIA_URL}products/{filename}"

        elif img_val and isinstance(img_val, str) and (img_val.startswith('data:image/') or len(img_val) > 500):
            import base64
            import uuid
            import io
            from PIL import Image
            from django.conf import settings
            from pathlib import Path
            try:
                if ';base64,' in img_val:
                    header, encoded = img_val.split(';base64,', 1)
                else:
                    encoded = img_val

                raw_bytes = base64.b64decode(encoded)
                # Verify image content with Pillow
                pil_img = Image.open(io.BytesIO(raw_bytes))
                pil_img.verify()
                fmt = (pil_img.format or 'PNG').upper()
                allowed = {'JPEG': 'jpg', 'PNG': 'png', 'WEBP': 'webp'}
                ext = allowed.get(fmt, 'png')

                media_dir = Path(settings.MEDIA_ROOT) / 'products'
                media_dir.mkdir(parents=True, exist_ok=True)
                filename = f"{uuid.uuid4().hex}.{ext}"
                file_path = media_dir / filename

                with open(file_path, 'wb') as f:
                    f.write(raw_bytes)

                data['primary_image'] = f"{settings.MEDIA_URL}products/{filename}"
            except Exception:
                # If decode fails, fallback to clean empty string to avoid validation error
                data['primary_image'] = ''

        # Resolve category if passed as string/slug/name
        cat_val = data.get('category')
        if cat_val is not None:
            is_int = False
            try:
                int(cat_val)
                is_int = True
            except (ValueError, TypeError):
                pass

            if not is_int and isinstance(cat_val, str) and cat_val.strip():
                from apps.products.models import Category
                from django.db.models import Q
                from django.utils.text import slugify
                val_clean = cat_val.strip()
                cat_slug = slugify(val_clean)
                found_cat = Category.objects.filter(
                    Q(slug__iexact=cat_slug) | Q(name__iexact=val_clean) | Q(slug__iexact=val_clean)
                ).first()
                if not found_cat:
                    found_cat, _ = Category.objects.get_or_create(
                        slug=cat_slug or 'general',
                        defaults={'name': val_clean}
                    )
                if found_cat:
                    data['category'] = found_cat.id

        # Resolve brand if passed as string/slug/name
        brand_val = data.get('brand')
        if brand_val is not None:
            is_int = False
            try:
                int(brand_val)
                is_int = True
            except (ValueError, TypeError):
                pass

            if not is_int and isinstance(brand_val, str) and brand_val.strip():
                from apps.products.models import Brand
                from django.db.models import Q
                from django.utils.text import slugify
                val_clean = brand_val.strip()
                brand_slug = slugify(val_clean)
                found_brand = Brand.objects.filter(
                    Q(slug__iexact=brand_slug) | Q(name__iexact=val_clean) | Q(slug__iexact=val_clean)
                ).first()
                if not found_brand:
                    found_brand, _ = Brand.objects.get_or_create(
                        slug=brand_slug or 'general',
                        defaults={'name': val_clean}
                    )
                if found_brand:
                    data['brand'] = found_brand.id

        return super().to_internal_value(data)

    def validate(self, data):
        name = data.get('name', getattr(self.instance, 'name', None))
        if name is not None and not str(name).strip():
            raise serializers.ValidationError({"name": "Product name cannot be blank."})

        price = data.get('price', getattr(self.instance, 'price', None))
        mrp = data.get('mrp', getattr(self.instance, 'mrp', None))
        stock = data.get('stock', getattr(self.instance, 'stock', None))
        low_stock_threshold = data.get('low_stock_threshold', getattr(self.instance, 'low_stock_threshold', None))

        if price is not None and mrp is not None and price > mrp:
            raise serializers.ValidationError({"price": "Selling price cannot exceed Maximum Retail Price (MRP)."})
        if price is not None and price < 0:
            raise serializers.ValidationError({"price": "Selling price must be non-negative."})
        if mrp is not None and mrp < 0:
            raise serializers.ValidationError({"mrp": "MRP must be non-negative."})
        if stock is not None and stock < 0:
            raise serializers.ValidationError({"stock": "Stock quantity cannot be negative."})
        if low_stock_threshold is not None and low_stock_threshold < 0:
            raise serializers.ValidationError({"low_stock_threshold": "Low stock threshold cannot be negative."})

        # Category and Subcategory compatibility check
        category = data.get('category', getattr(self.instance, 'category', None))
        subcategory = data.get('subcategory', getattr(self.instance, 'subcategory', None))
        if subcategory and category and subcategory.category_id != category.id:
            raise serializers.ValidationError({"subcategory": f"Subcategory '{subcategory.name}' does not belong to category '{category.name}'."})

        return data

    def create(self, validated_data):
        specs_data = self.initial_data.get('specifications') or self.initial_data.get('specs')
        product = super().create(validated_data)

        # Ensure primary_image has category default if not provided
        if not product.primary_image and product.category:
            from apps.products.management.commands.correct_product_images import CATEGORY_DEFAULT_MAP, GENERIC_DEFAULT
            cat_slug = product.category.slug or ''
            default_img = CATEGORY_DEFAULT_MAP.get(cat_slug, GENERIC_DEFAULT)
            product.primary_image = default_img
            product.save(update_fields=['primary_image'])

        if product.primary_image:
            from apps.products.models import ProductImage
            if not product.images.filter(is_primary=True, image_url=product.primary_image).exists():
                product.images.filter(is_primary=True).update(is_primary=False)
                ProductImage.objects.create(
                    product=product,
                    image_url=product.primary_image,
                    is_primary=True,
                    sort_order=0
                )

        if specs_data and isinstance(specs_data, list):
            from apps.products.models import ProductSpecification
            for idx, item in enumerate(specs_data):
                if isinstance(item, dict):
                    k = item.get('key') or item.get('spec_key')
                    v = item.get('value') or item.get('spec_value')
                    if k and str(k).strip() and v and str(v).strip():
                        ProductSpecification.objects.create(
                            product=product,
                            spec_key=str(k).strip(),
                            spec_value=str(v).strip(),
                            sort_order=idx
                        )
        return product

    def update(self, instance, validated_data):
        specs_data = self.initial_data.get('specifications') or self.initial_data.get('specs')
        product = super().update(instance, validated_data)

        if product.primary_image:
            from apps.products.models import ProductImage
            if not product.images.filter(is_primary=True, image_url=product.primary_image).exists():
                product.images.filter(is_primary=True).update(is_primary=False)
                ProductImage.objects.create(
                    product=product,
                    image_url=product.primary_image,
                    is_primary=True,
                    sort_order=0
                )

        if specs_data is not None and isinstance(specs_data, list):
            from apps.products.models import ProductSpecification
            product.specifications.all().delete()
            for idx, item in enumerate(specs_data):
                if isinstance(item, dict):
                    k = item.get('key') or item.get('spec_key')
                    v = item.get('value') or item.get('spec_value')
                    if k and str(k).strip() and v and str(v).strip():
                        ProductSpecification.objects.create(
                            product=product,
                            spec_key=str(k).strip(),
                            spec_value=str(v).strip(),
                            sort_order=idx
                        )
        return product
