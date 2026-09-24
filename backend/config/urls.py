from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/v1/auth/', include('apps.users.urls')),
    path('api/v1/catalog/', include('apps.products.urls')),
    path('api/v1/inventory/', include('apps.inventory.urls')),
    path('api/v1/addresses/', include('apps.users.urls_address')),
    path('api/v1/orders/', include('apps.orders.urls')),
    path('api/v1/finance/', include('apps.finance.urls')),
    path('api/v1/inquiries/', include('apps.core.urls')),
    path('api/v1/config/', include('apps.commercial_config.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
