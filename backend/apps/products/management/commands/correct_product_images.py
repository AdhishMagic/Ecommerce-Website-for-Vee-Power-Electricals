import json
from pathlib import Path
from django.core.management.base import BaseCommand
from django.conf import settings
from apps.products.models import Product, ProductImage, Category


CATEGORY_DEFAULT_MAP = {
    'electrical-accessories': '/media/defaults/electrical-accessories.webp',
    'accessories': '/media/defaults/electrical-accessories.webp',
    'lighting': '/media/defaults/lighting.webp',
    'led-lighting': '/media/defaults/led-lighting.webp',
    'led-luminaires': '/media/defaults/led-luminaires.webp',
    'mcb-distribution': '/media/defaults/mcb-distribution.webp',
    'mcb': '/media/defaults/mcb-protection.webp',
    'mcb-protection': '/media/defaults/mcb-protection.webp',
    'switches': '/media/defaults/switches.webp',
    'fans': '/media/defaults/fans.webp',
    'wires-cables': '/media/defaults/wires-cables.webp',
    'modular-switches': '/media/defaults/modular-switches.webp',
}

GENERIC_DEFAULT = '/media/defaults/generic-electrical.webp'

IRRELEVANT_STOCK_PHOTOS = [
    'photo-1544716278-ca5e3f4abd8c',  # Books / Library
    'photo-1550985616-10810253b84d',  # Groceries / Coffee
    'photo-1581092160607-ee22621dd758',  # Factory person portrait
    '4f1b917f02cc4bd6a10856cce028e143.png',  # 70-byte broken placeholder
    'dc0c7dd2f0f641979c0d97778bf45825.png',  # 70-byte broken placeholder
    'placehold.co',
]


class Command(BaseCommand):
    help = 'Audit and systematically correct product images using category-appropriate defaults'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Simulate corrections without modifying database records',
        )

    def handle(self, *args, **options):
        dry_run = options.get('dry_run', False)
        self.stdout.write(self.style.NOTICE(f"--- Product Image Correction Audit (dry_run={dry_run}) ---"))

        backup_records = []
        corrected_products = []

        products = Product.objects.select_related('category', 'brand').all().order_by('id')

        for p in products:
            cat_slug = p.category.slug if p.category else ''
            cat_name = p.category.name if p.category else ''
            default_img = CATEGORY_DEFAULT_MAP.get(cat_slug, GENERIC_DEFAULT)

            current_img = p.primary_image or ''
            needs_correction = False
            reason = ''

            # Check if empty
            if not current_img.strip():
                needs_correction = True
                reason = 'Missing / empty image'
            else:
                for bad_pattern in IRRELEVANT_STOCK_PHOTOS:
                    if bad_pattern in current_img:
                        needs_correction = True
                        reason = f'Inappropriate / broken image pattern ({bad_pattern})'
                        break

            # If existing unsplash image is a generic stock photo, align to category default
            if not needs_correction and 'images.unsplash.com' in current_img:
                needs_correction = True
                reason = 'Unsplash generic stock photo replaced with authoritative local category default'

            if needs_correction:
                backup_records.append({
                    'product_id': p.id,
                    'sku': p.sku,
                    'name': p.name,
                    'category': cat_name,
                    'old_primary_image': current_img,
                    'new_primary_image': default_img,
                    'reason': reason,
                })

                if not dry_run:
                    p.primary_image = default_img
                    p.save(update_fields=['primary_image'])

                    # Also update or align ProductImage entries for this product
                    prod_images = ProductImage.objects.filter(product=p)
                    if prod_images.exists():
                        for pi in prod_images:
                            pi.image_url = default_img
                            pi.save(update_fields=['image_url'])
                    else:
                        ProductImage.objects.create(
                            product=p,
                            image_url=default_img,
                            alt_text=f"{p.name} - {cat_name}",
                            sort_order=0,
                            is_primary=True
                        )

                corrected_products.append({
                    'id': p.id,
                    'sku': p.sku,
                    'name': p.name,
                    'category': cat_name,
                    'reason': reason,
                    'new_image': default_img
                })

        # Save backup file for auditability and rollback
        backup_path = Path(settings.MEDIA_ROOT) / 'product_image_audit_backup.json'
        with open(backup_path, 'w', encoding='utf-8') as f:
            json.dump(backup_records, f, indent=2)

        self.stdout.write(self.style.SUCCESS(
            f"Successfully audited {products.count()} products. Corrected: {len(corrected_products)}. "
            f"Backup saved to {backup_path}"
        ))

        for c in corrected_products:
            self.stdout.write(f"  [ID {c['id']}] {c['sku']} ({c['name']}) -> {c['new_image']} [{c['reason']}]")
