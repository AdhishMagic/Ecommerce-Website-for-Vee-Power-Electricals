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
    fields = ('image_url', 'alt_text', 'sort_order', 'is_primary')
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
    list_display = ('name', 'sku', 'brand', 'category', 'price', 'stock', 'is_indexable', 'active')
    list_filter = ('active', 'is_indexable', 'category', 'brand', 'featured')
    search_fields = ('name', 'sku', 'brand__name', 'category__name', 'subcategory__name', 'slug')
    prepopulated_fields = {'slug': ('name',)}
    inlines = [ProductImageInline, ProductSpecificationInline]
    actions = ['regenerate_seo_metadata_action', 'submit_to_indexnow_action']

    fieldsets = (
        ('Basic Information', {
            'fields': ('name', 'slug', 'sku', 'brand', 'category', 'subcategory', 'description')
        }),
        ('Pricing & Inventory', {
            'fields': ('mrp', 'price', 'stock', 'low_stock_threshold', 'primary_image', 'featured', 'active')
        }),
        ('Search Engine Optimization (SEO)', {
            'fields': ('is_indexable', 'meta_title', 'meta_description', 'canonical_url'),
            'description': 'Configure SEO parameters for search engines (Google, Bing, Yahoo). If left blank, metadata is automatically generated.'
        }),
    )

    @admin.action(description="Regenerate SEO titles & descriptions for selected products")
    def regenerate_seo_metadata_action(self, request, queryset):
        count = 0
        for prod in queryset:
            prod.meta_title = ''
            prod.meta_description = ''
            prod.canonical_url = ''
            prod.generate_seo_metadata()
            prod.save()
            count += 1
        self.message_user(request, f"Successfully regenerated SEO metadata for {count} products.")

    @admin.action(description="Submit selected products to IndexNow (Bing, Yandex)")
    def submit_to_indexnow_action(self, request, queryset):
        from apps.products.services_indexnow import submit_urls_to_indexnow, get_site_url
        site_url = get_site_url()
        urls = [f"{site_url}/product/{p.slug}" for p in queryset if p.active and p.is_indexable]
        if urls:
            result = submit_urls_to_indexnow(urls)
            self.message_user(request, f"IndexNow submission for {len(urls)} products: {result.get('status')}")
        else:
            self.message_user(request, "No active indexable products were selected.")


@admin.register(ProductImage)
class ProductImageAdmin(admin.ModelAdmin):
    list_display = ('product', 'image_url', 'sort_order', 'is_primary', 'created_at')
    list_filter = ('is_primary',)
    search_fields = ('product__name', 'product__sku', 'image_url')


@admin.register(ProductSpecification)
class ProductSpecificationAdmin(admin.ModelAdmin):
    list_display = ('product', 'spec_key', 'spec_value', 'sort_order', 'created_at')
    search_fields = ('product__name', 'product__sku', 'spec_key', 'spec_value')
