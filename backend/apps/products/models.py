from decimal import Decimal
from django.db import models
from django.utils.text import slugify
from apps.common.models import TimeStampedModel


class CategoryDiscountType(models.TextChoices):
    PERCENTAGE = 'percentage', 'Percentage'
    FIXED = 'fixed', 'Fixed Rupee Amount'


class Category(TimeStampedModel):
    """
    Primary merchandise taxonomy and homepage hero promotional showcase.
    """
    name = models.CharField(max_length=100, unique=True)
    slug = models.SlugField(max_length=100, unique=True)
    icon = models.CharField(max_length=50, default='⚡')
    image = models.CharField(max_length=500, blank=True, default='')
    subtitle = models.CharField(max_length=150, blank=True, default='')
    hero_order = models.PositiveIntegerField(default=0)
    hero_badge = models.CharField(max_length=50, blank=True, default='')
    show_in_hero = models.BooleanField(default=False)
    discount_enabled = models.BooleanField(default=False)
    discount_type = models.CharField(
        max_length=20,
        choices=CategoryDiscountType.choices,
        default=CategoryDiscountType.PERCENTAGE
    )
    discount_value = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    discount_label = models.CharField(max_length=50, blank=True, default='')
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'categories'
        verbose_name = 'Category'
        verbose_name_plural = 'Categories'
        ordering = ['hero_order', 'name']
        constraints = [
            models.CheckConstraint(
                check=models.Q(discount_value__gte=0),
                name='chk_cat_disc_val'
            ),
        ]
        indexes = [
            models.Index(fields=['show_in_hero', 'is_active', 'hero_order'], name='idx_cat_hero'),
        ]

    def save(self, *args, **kwargs):
        if not self.slug and self.name:
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class Subcategory(TimeStampedModel):
    """
    Secondary hierarchical classification under a parent category.
    """
    category = models.ForeignKey(
        Category,
        on_delete=models.CASCADE,
        related_name='subcategories'
    )
    name = models.CharField(max_length=100)
    slug = models.SlugField(max_length=100)
    description = models.TextField(null=True, blank=True)
    display_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'subcategories'
        verbose_name = 'Subcategory'
        verbose_name_plural = 'Subcategories'
        ordering = ['display_order', 'name']
        constraints = [
            models.UniqueConstraint(
                fields=['category', 'slug'],
                name='uq_subcat_slug'
            ),
        ]

    def save(self, *args, **kwargs):
        if not self.slug and self.name:
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.category.name} > {self.name}"


class Brand(TimeStampedModel):
    """
    Manufacturer brand registry (Havells, Polycab, Finolex, Philips, Legrand).
    """
    name = models.CharField(max_length=100, unique=True)
    slug = models.SlugField(max_length=100, unique=True)
    logo_url = models.CharField(max_length=500, blank=True, default='')
    description = models.TextField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'brands'
        verbose_name = 'Brand'
        verbose_name_plural = 'Brands'
        ordering = ['name']
        indexes = [
            models.Index(fields=['is_active'], name='idx_brand_active'),
        ]

    def save(self, *args, **kwargs):
        if not self.slug and self.name:
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class Product(TimeStampedModel):
    """
    Master electrical goods merchandise catalog item.
    """
    name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=255, unique=True)
    sku = models.CharField(max_length=100, unique=True)
    category = models.ForeignKey(
        Category,
        on_delete=models.PROTECT,
        related_name='products'
    )
    subcategory = models.ForeignKey(
        Subcategory,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='products'
    )
    brand = models.ForeignKey(
        Brand,
        on_delete=models.PROTECT,
        related_name='products'
    )
    mrp = models.DecimalField(max_digits=10, decimal_places=2)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    stock = models.IntegerField(default=0)
    low_stock_threshold = models.IntegerField(default=5)
    description = models.TextField(null=True, blank=True)
    primary_image = models.CharField(max_length=500, blank=True, default='')
    featured = models.BooleanField(default=False)
    active = models.BooleanField(default=True)

    class Meta:
        db_table = 'products'
        verbose_name = 'Product'
        verbose_name_plural = 'Products'
        ordering = ['-created_at']
        constraints = [
            models.CheckConstraint(
                check=models.Q(price__lte=models.F('mrp')),
                name='chk_product_price_mrp'
            ),
            models.CheckConstraint(
                check=models.Q(price__gte=0),
                name='chk_product_price_pos'
            ),
            models.CheckConstraint(
                check=models.Q(mrp__gte=0),
                name='chk_product_mrp_pos'
            ),
            models.CheckConstraint(
                check=models.Q(stock__gte=0),
                name='chk_product_stock_pos'
            ),
            models.CheckConstraint(
                check=models.Q(low_stock_threshold__gte=0),
                name='chk_product_low_stock'
            ),
        ]
        indexes = [
            models.Index(fields=['category', 'brand', 'active'], name='idx_prod_cat_brand'),
            models.Index(fields=['featured', 'active'], name='idx_prod_featured'),
            models.Index(fields=['price'], name='idx_prod_price'),
            models.Index(fields=['created_at'], name='idx_prod_created'),
        ]

    def save(self, *args, **kwargs):
        if not self.slug and self.name:
            self.slug = slugify(self.name)
        if self.sku:
            self.sku = self.sku.upper().strip()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} ({self.sku})"


class ProductImage(models.Model):
    """
    High-resolution gallery images for a product.
    """
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name='images'
    )
    image_url = models.CharField(max_length=500)
    alt_text = models.CharField(max_length=255, blank=True, default='')
    sort_order = models.PositiveIntegerField(default=0)
    is_primary = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'product_images'
        verbose_name = 'Product Image'
        verbose_name_plural = 'Product Images'
        ordering = ['sort_order', 'id']
        indexes = [
            models.Index(fields=['product', 'sort_order'], name='idx_prod_img_sort'),
        ]

    def __str__(self):
        return f"Image for {self.product.name} (order: {self.sort_order})"


class ProductSpecification(models.Model):
    """
    Key-value technical parameters for electrical goods (Sweep, Wattage, Voltage, Wire Gauge).
    """
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name='specifications'
    )
    spec_key = models.CharField(max_length=100)
    spec_value = models.CharField(max_length=255)
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'product_specifications'
        verbose_name = 'Product Specification'
        verbose_name_plural = 'Product Specifications'
        ordering = ['sort_order', 'spec_key']
        constraints = [
            models.UniqueConstraint(
                fields=['product', 'spec_key'],
                name='uq_prod_spec'
            ),
        ]

    def __str__(self):
        return f"{self.product.name}: {self.spec_key} = {self.spec_value}"
