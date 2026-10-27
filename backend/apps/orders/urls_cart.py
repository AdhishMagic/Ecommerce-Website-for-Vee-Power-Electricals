from django.urls import path
from .views_cart import (
    CartView,
    CartItemAddView,
    CartItemDetailView,
    CartClearView,
    CartMergeView,
)

urlpatterns = [
    path('', CartView.as_view(), name='cart-detail'),
    path('items/', CartItemAddView.as_view(), name='cart-item-add'),
    path('items/<int:item_id>/', CartItemDetailView.as_view(), name='cart-item-detail'),
    path('items/product/<int:product_id>/', CartItemDetailView.as_view(), name='cart-item-by-product'),
    path('clear/', CartClearView.as_view(), name='cart-clear'),
    path('merge/', CartMergeView.as_view(), name='cart-merge'),
]
