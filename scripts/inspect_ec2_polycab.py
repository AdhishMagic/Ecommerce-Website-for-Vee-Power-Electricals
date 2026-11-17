import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.production')
django.setup()

from apps.products.models import Product, Brand

print("=== CHECKING BRANDS AND POLYCAB PRODUCTS ===")
brands = Brand.objects.all()
for b in brands:
    print(f"Brand: id={b.id}, name='{b.name}', slug='{b.slug}', is_active={b.is_active}")

polycab_prods = Product.objects.filter(brand__name__iexact='Polycab')
print(f"\nPolycab Products count: {polycab_prods.count()}")
for p in polycab_prods:
    print(f"  ID: {p.id}, name='{p.name}', slug='{p.slug}', active={p.active}, is_indexable={p.is_indexable}, stock={p.stock}, price={p.price}")
