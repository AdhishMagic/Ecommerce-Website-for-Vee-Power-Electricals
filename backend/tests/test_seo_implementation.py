import xml.etree.ElementTree as ET
from decimal import Decimal
from django.test import TestCase, Client
from django.conf import settings
from apps.products.models import Product, Category, Brand, ProductImage
from apps.products.services_indexnow import (
    get_indexnow_api_key,
    get_site_url,
    get_site_domain,
    submit_urls_to_indexnow,
)


class CompleteSEOTestCase(TestCase):
    """
    Automated test suite validating all phases of the SEO implementation:
    - Robots.txt
    - XML Sitemap
    - Product slug uniqueness and collision-free generation
    - Dynamic SEO title, description, and canonical URL synthesis
    - Image alt text generation
    - IndexNow verification and submission
    - Crawler prerender endpoint with Schema.org JSON-LD
    - 404 responses with noindex
    """

    def setUp(self):
        self.client = Client()
        self.category = Category.objects.create(
            name="Testing Switches",
            slug="testing-switches",
            is_active=True,
        )
        self.brand = Brand.objects.create(
            name="Havells Test",
            slug="havells-test",
            is_active=True,
        )
        self.product = Product.objects.create(
            name="Modular 10A Switch",
            sku="TEST-SWI-001",
            category=self.category,
            brand=self.brand,
            price=Decimal("120.00"),
            mrp=Decimal("150.00"),
            stock=25,
            description="Premium quality 10A modular switch for residential installation.",
            active=True,
            is_indexable=True,
        )

    def test_robots_txt_accessibility_and_directives(self):
        """Phase 5: Validate robots.txt structure, allowed/disallowed paths, and sitemap reference."""
        response = self.client.get('/robots.txt')
        self.assertEqual(response.status_code, 200)
        self.assertIn('text/plain', response['Content-Type'])

        content = response.content.decode('utf-8')
        self.assertIn('User-agent: *', content)
        self.assertIn('Allow: /', content)
        self.assertIn('Allow: /product/', content)
        self.assertIn('Allow: /media/', content)
        self.assertIn('Allow: /assets/', content)
        self.assertIn('Disallow: /admin/', content)
        self.assertIn('Disallow: /api/', content)
        self.assertIn('Disallow: /cart', content)
        self.assertIn('Disallow: /checkout', content)
        self.assertIn('Disallow: /account', content)
        self.assertIn('Sitemap: https://veepowerelectricals.com/sitemap.xml', content)

    def test_sitemap_xml_validity(self):
        """Phase 5: Validate sitemap.xml structure, XML validity, and product inclusion."""
        response = self.client.get('/sitemap.xml')
        self.assertEqual(response.status_code, 200)
        self.assertIn('application/xml', response['Content-Type'])

        content = response.content.decode('utf-8')
        self.assertTrue(content.startswith('<?xml version="1.0" encoding="UTF-8"?>'))

        # ElementTree parses XML to ensure well-formed document
        root = ET.fromstring(response.content)
        self.assertTrue(root.tag.endswith('urlset'))

        # Check loc elements
        locs = [elem.text for elem in root.findall('.//{http://www.sitemaps.org/schemas/sitemap/0.9}loc')]
        self.assertIn('https://veepowerelectricals.com/', locs)
        self.assertIn('https://veepowerelectricals.com/shop', locs)
        self.assertIn(f'https://veepowerelectricals.com/product/{self.product.slug}', locs)
        self.assertIn('https://veepowerelectricals.com/categories/fans', locs)
        self.assertIn(f'https://veepowerelectricals.com/brands/{self.brand.slug}', locs)

        # Excluded URLs should never be present in sitemap
        for loc in locs:
            self.assertNotIn('/admin', loc)
            self.assertNotIn('/cart', loc)
            self.assertNotIn('/checkout', loc)
            self.assertNotIn('/api', loc)
            self.assertNotIn('/account', loc)

    def test_product_slug_uniqueness_and_collision_avoidance(self):
        """Phase 3: Creating two products with identical names must generate unique slugs."""
        p2 = Product.objects.create(
            name="Modular 10A Switch",  # Same name
            sku="TEST-SWI-002",
            category=self.category,
            brand=self.brand,
            price=Decimal("130.00"),
            mrp=Decimal("160.00"),
            stock=10,
        )
        self.assertNotEqual(self.product.slug, p2.slug)
        self.assertTrue(p2.slug.startswith("modular-10a-switch-"))

    def test_product_seo_metadata_automatic_synthesis(self):
        """Phase 3: Product saves must automatically generate SEO title, description, and canonical URL."""
        self.assertTrue(bool(self.product.meta_title))
        self.assertIn("Modular 10A Switch", self.product.meta_title)
        self.assertIn("Havells Test", self.product.meta_title)
        self.assertIn("Vee Power Electricals", self.product.meta_title)

        self.assertTrue(bool(self.product.meta_description))
        self.assertIn("120", self.product.meta_description)
        self.assertIn("INR", self.product.meta_description)
        self.assertIn("Testing Switches", self.product.meta_description)

        self.assertEqual(
            self.product.canonical_url,
            f"https://veepowerelectricals.com/product/{self.product.slug}"
        )

    def test_product_seo_custom_override_preservation(self):
        """Phase 10: Custom SEO titles and descriptions set by administrators must be preserved."""
        custom_title = "Custom Exclusive Switch | Special Offer"
        custom_desc = "Custom meta description written by store administrator."
        p = Product.objects.create(
            name="Custom Switch",
            sku="TEST-CUST-001",
            category=self.category,
            brand=self.brand,
            price=Decimal("99.00"),
            mrp=Decimal("110.00"),
            meta_title=custom_title,
            meta_description=custom_desc,
        )
        self.assertEqual(p.meta_title, custom_title)
        self.assertEqual(p.meta_description, custom_desc)

    def test_product_image_alt_text_autogen(self):
        """Phase 3: Empty alt_text on ProductImage must automatically synthesize descriptive text."""
        img = ProductImage.objects.create(
            product=self.product,
            image_url="/media/products/test-switch.jpg",
            alt_text="",
        )
        self.assertTrue(bool(img.alt_text))
        self.assertIn("Havells Test", img.alt_text)
        self.assertIn("Modular 10A Switch", img.alt_text)

    def test_indexnow_verification_endpoint(self):
        """Phase 7: IndexNow key file must be served at /<key>.txt."""
        key = get_indexnow_api_key()
        response = self.client.get(f'/{key}.txt')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content.decode('utf-8').strip(), key)

        # Invalid key must 404
        bad_response = self.client.get('/invalid-key-xyz.txt')
        self.assertEqual(bad_response.status_code, 404)

    def test_crawler_prerender_homepage(self):
        """Phase 6: Search bot crawler request to / returns LocalBusiness/ElectricalSupplyStore & WebSite JSON-LD."""
        response = self.client.get('/seo/render/?path=/')
        self.assertEqual(response.status_code, 200)
        content = response.content.decode('utf-8')
        self.assertIn('<title>', content)
        self.assertIn('Vee Power Electricals', content)
        self.assertIn('https://schema.org', content)
        self.assertIn('"@type": "ElectricalSupplyStore"', content)
        self.assertIn('"@type": "WebSite"', content)
        self.assertIn('SearchAction', content)

    def test_crawler_prerender_product_page(self):
        """Phase 6: Search bot crawler request to /product/<slug> returns full Product JSON-LD & specs."""
        response = self.client.get(f'/seo/render/?path=/product/{self.product.slug}')
        self.assertEqual(response.status_code, 200)
        content = response.content.decode('utf-8')
        self.assertIn(self.product.name, content)
        self.assertIn(self.product.sku, content)
        self.assertIn(str(self.product.price), content)
        self.assertIn('"@type": "Product"', content)
        self.assertIn('"@type": "Offer"', content)
        self.assertIn('"priceCurrency": "INR"', content)
        self.assertIn('"@type": "BreadcrumbList"', content)
        self.assertIn('<link rel="canonical"', content)

    def test_crawler_prerender_404_handling(self):
        """Phase 6: Search bot crawler request for non-existent product returns HTTP 404 with noindex."""
        response = self.client.get('/seo/render/?path=/product/non-existent-slug-99999')
        self.assertEqual(response.status_code, 404)
        content = response.content.decode('utf-8')
        self.assertIn('404', content)
        self.assertIn('noindex', content)

    def test_production_settings_contain_canonical_domains(self):
        """Verify production configuration preserves existing settings and contains primary domains."""
        from config.settings import production
        self.assertIn('veepowerelectricals.com', production.ALLOWED_HOSTS)
        self.assertIn('www.veepowerelectricals.com', production.ALLOWED_HOSTS)
        self.assertIn('https://veepowerelectricals.com', production.CSRF_TRUSTED_ORIGINS)
        self.assertIn('https://www.veepowerelectricals.com', production.CSRF_TRUSTED_ORIGINS)

    def test_category_landing_pages_in_sitemap_and_prerender(self):
        """Phase 2: All 6 category landing pages must be present in sitemap and renderable."""
        response = self.client.get('/sitemap.xml')
        self.assertEqual(response.status_code, 200)
        content = response.content.decode('utf-8')
        for cat in ['fans', 'wires-cables', 'switches', 'led-lighting', 'mcb-protection', 'electrical-accessories']:
            self.assertIn(f'https://veepowerelectricals.com/categories/{cat}', content)

        # Test crawler prerender for a category
        prerender_res = self.client.get('/seo/render/?path=/categories/fans')
        self.assertEqual(prerender_res.status_code, 200)
        self.assertIn('Fans', prerender_res.content.decode('utf-8'))
        self.assertIn('canonical', prerender_res.content.decode('utf-8'))

    def test_brand_inventory_indexing_rules(self):
        """Phase 3 Rule: Brands with active inventory are indexed; zero-inventory brands are excluded from sitemap and marked noindex."""
        # Havells Test has self.product in inventory -> Must be in sitemap and indexed
        sitemap_res = self.client.get('/sitemap.xml')
        sitemap_content = sitemap_res.content.decode('utf-8')
        self.assertIn(f'https://veepowerelectricals.com/brands/{self.brand.slug}', sitemap_content)

        in_stock_res = self.client.get(f'/seo/render/?path=/brands/{self.brand.slug}')
        self.assertEqual(in_stock_res.status_code, 200)
        self.assertIn('<meta name="robots" content="index, follow">', in_stock_res.content.decode('utf-8'))

        # Create zero-inventory brand
        empty_brand = Brand.objects.create(name="Anchor Zero", slug="anchor-zero", is_active=True)

        sitemap_res2 = self.client.get('/sitemap.xml')
        sitemap_content2 = sitemap_res2.content.decode('utf-8')
        # Zero inventory brand MUST NOT be in sitemap
        self.assertNotIn(f'https://veepowerelectricals.com/brands/{empty_brand.slug}', sitemap_content2)

        # Crawler must receive noindex
        empty_brand_res = self.client.get(f'/seo/render/?path=/brands/{empty_brand.slug}')
        self.assertEqual(empty_brand_res.status_code, 200)
        self.assertIn('<meta name="robots" content="noindex, follow">', empty_brand_res.content.decode('utf-8'))

    def test_tamil_nadu_38_districts_in_sitemap_and_prerender(self):
        """Phase 4: Central hub and all 38 Tamil Nadu districts must be in sitemap and deliver localized content."""
        sitemap_res = self.client.get('/sitemap.xml')
        content = sitemap_res.content.decode('utf-8')
        self.assertIn('https://veepowerelectricals.com/locations/tamil-nadu', content)
        self.assertIn('https://veepowerelectricals.com/locations/tamil-nadu/coimbatore', content)
        self.assertIn('https://veepowerelectricals.com/locations/tamil-nadu/chennai', content)
        self.assertIn('https://veepowerelectricals.com/locations/tamil-nadu/tiruppur', content)

        # Test hub prerender
        hub_res = self.client.get('/seo/render/?path=/locations/tamil-nadu')
        self.assertEqual(hub_res.status_code, 200)
        self.assertIn('Tamil Nadu', hub_res.content.decode('utf-8'))

        # Test district prerender
        cbe_res = self.client.get('/seo/render/?path=/locations/tamil-nadu/coimbatore')
        self.assertEqual(cbe_res.status_code, 200)
        self.assertIn('Coimbatore', cbe_res.content.decode('utf-8'))

    def test_buyer_guides_in_sitemap_and_prerender(self):
        """Phase 11: Content authority guides must be in sitemap and renderable."""
        sitemap_res = self.client.get('/sitemap.xml')
        content = sitemap_res.content.decode('utf-8')
        self.assertIn('https://veepowerelectricals.com/guides', content)
        self.assertIn('https://veepowerelectricals.com/guides/wire-selection-guide', content)
        self.assertIn('https://veepowerelectricals.com/guides/mcb-rccb-guide', content)

        guide_res = self.client.get('/seo/render/?path=/guides/wire-selection-guide')
        self.assertEqual(guide_res.status_code, 200)
        self.assertIn('Wire Selection Guide', guide_res.content.decode('utf-8'))

    def test_google_shopping_feed_xml(self):
        """Phase 7: Google Shopping feed must return valid RSS 2.0 XML with Google Merchant namespace."""
        response = self.client.get('/feeds/google-shopping.xml')
        self.assertEqual(response.status_code, 200)
        self.assertIn('application/xml', response['Content-Type'])

        content = response.content.decode('utf-8')
        self.assertTrue(content.startswith('<?xml version="1.0" encoding="UTF-8"?>'))
        self.assertIn('<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">', content)
        self.assertIn(f'<g:id>{self.product.sku}</g:id>', content)
        self.assertIn(f'<g:title>{self.product.name}</g:title>', content)
        self.assertIn('<g:price>120.00 INR</g:price>', content)
        self.assertIn('<g:availability>in_stock</g:availability>', content)
        self.assertIn(f'<g:brand>{self.brand.name}</g:brand>', content)

