from django.contrib import admin
from .models import (
    Category,
    Subcategory,
    Brand,
    Product,
    ProductImage,
    ProductSpecification,
)


class ProductImageInline(admin.TabularInline):
    model = ProductImage
    extra = 1


class ProductSpecificationInline(admin.TabularInline):
    model = ProductSpecification
    extra = 1


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'slug', 'hero_order', 'show_in_hero', 'discount_enabled', 'discount_value', 'is_active')
    list_filter = ('is_active', 'show_in_hero', 'discount_enabled')
    search_fields = ('name', 'slug')
    prepopulated_fields = {'slug': ('name',)}


@admin.register(Subcategory)
class SubcategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'category', 'slug', 'display_order', 'is_active')
    list_filter = ('category', 'is_active')
    search_fields = ('name', 'slug', 'category__name')
    prepopulated_fields = {'slug': ('name',)}


@admin.register(Brand)
class BrandAdmin(admin.ModelAdmin):
    list_display = ('name', 'slug', 'is_active')
    list_filter = ('is_active',)
    search_fields = ('name', 'slug')
    prepopulated_fields = {'slug': ('name',)}


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ('name', 'sku', 'category', 'subcategory', 'brand', 'price', 'mrp', 'stock', 'featured', 'active')
    list_filter = ('category', 'brand', 'active', 'featured')
    search_fields = ('name', 'sku', 'brand__name', 'category__name', 'subcategory__name')
    prepopulated_fields = {'slug': ('name',)}
    inlines = [ProductImageInline, ProductSpecificationInline]


@admin.register(ProductImage)
class ProductImageAdmin(admin.ModelAdmin):
    list_display = ('product', 'image_url', 'sort_order', 'is_primary', 'created_at')
    list_filter = ('is_primary',)
    search_fields = ('product__name', 'product__sku', 'image_url')


@admin.register(ProductSpecification)
class ProductSpecificationAdmin(admin.ModelAdmin):
    list_display = ('product', 'spec_key', 'spec_value', 'sort_order', 'created_at')
    search_fields = ('product__name', 'product__sku', 'spec_key', 'spec_value')
