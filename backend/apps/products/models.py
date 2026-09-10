from django.db import models
from apps.common.models import TimeStampedModel

class Category(TimeStampedModel):
    name = models.CharField(max_length=100, unique=True)
    slug = models.SlugField(max_length=100, unique=True)
    icon = models.CharField(max_length=50, default='⚡')
    subcategories = models.JSONField(default=list)

    class Meta:
        verbose_name_plural = 'Categories'

    def __str__(self):
        return self.name

class Brand(TimeStampedModel):
    name = models.CharField(max_length=100, unique=True)
    slug = models.SlugField(max_length=100, unique=True)

    def __str__(self):
        return self.name

class Product(TimeStampedModel):
    name = models.CharField(max_length=255)
    sku = models.CharField(max_length=100, unique=True)
    brand = models.CharField(max_length=100)
    category = models.CharField(max_length=100)
    subcategory = models.CharField(max_length=100, blank=True)
    mrp = models.DecimalField(max_digits=10, decimal_places=2)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    stock = models.IntegerField(default=0)
    low_stock_threshold = models.IntegerField(default=5)
    images = models.JSONField(default=list)
    description = models.TextField(blank=True)
    specifications = models.JSONField(default=dict)
    tags = models.JSONField(default=list)
    featured = models.BooleanField(default=False)
    active = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.name} ({self.sku})"
