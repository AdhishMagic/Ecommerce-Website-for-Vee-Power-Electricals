from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    CategoryViewSet,
    SubcategoryViewSet,
    BrandViewSet,
    ProductViewSet,
    ProductImageViewSet,
    ProductSpecificationViewSet,
)

router = DefaultRouter()
router.register(r'categories', CategoryViewSet, basename='category')
router.register(r'subcategories', SubcategoryViewSet, basename='subcategory')
router.register(r'brands', BrandViewSet, basename='brand')
router.register(r'products', ProductViewSet, basename='product')
router.register(r'images', ProductImageViewSet, basename='product-image')
router.register(r'specifications', ProductSpecificationViewSet, basename='product-spec')

urlpatterns = [
    path('', include(router.urls)),
]
