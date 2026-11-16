from django.core.management.base import BaseCommand
from apps.products.models import Product, Category, Brand
from apps.products.services_indexnow import submit_urls_to_indexnow, get_site_url


class Command(BaseCommand):
    help = 'Submit published website URLs to IndexNow (Bing, Yandex, etc.) for instant indexing'

    def add_arguments(self, parser):
        parser.add_argument(
            '--all',
            action='store_true',
            help='Submit all public URLs including homepage, shop, categories, brands, and products',
        )
        parser.add_argument(
            '--products-only',
            action='store_true',
            help='Submit only active, published products',
        )

    def handle(self, *args, **options):
        site_url = get_site_url()
        urls = []

        if options.get('all') or not options.get('products_only'):
            urls.extend([
                f"{site_url}/",
                f"{site_url}/shop",
                f"{site_url}/categories",
                f"{site_url}/brands",
                f"{site_url}/about",
                f"{site_url}/contact",
                f"{site_url}/privacy-policy",
                f"{site_url}/terms-and-conditions",
                f"{site_url}/shipping-policy",
                f"{site_url}/return-policy",
            ])

            for cat in Category.objects.filter(is_active=True):
                urls.append(f"{site_url}/shop?category={cat.slug}")

            for brand in Brand.objects.filter(is_active=True):
                urls.append(f"{site_url}/shop?brand={brand.slug}")

        # Active products eligible for indexing
        products = Product.objects.filter(active=True, is_indexable=True)
        for prod in products:
            urls.append(f"{site_url}/product/{prod.slug}")

        self.stdout.write(self.style.NOTICE(f"Submitting {len(urls)} URLs to IndexNow..."))
        result = submit_urls_to_indexnow(urls)

        if result.get('status') == 'success':
            self.stdout.write(
                self.style.SUCCESS(
                    f"Successfully submitted {result.get('submitted_count')} URLs to IndexNow. HTTP {result.get('http_status')}"
                )
            )
        else:
            self.stdout.write(
                self.style.WARNING(
                    f"IndexNow submission result: {result}"
                )
            )
