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
    class Meta:
        model = ProductImage
        fields = ['id', 'product', 'image_url', 'alt_text', 'sort_order', 'is_primary', 'created_at']
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
