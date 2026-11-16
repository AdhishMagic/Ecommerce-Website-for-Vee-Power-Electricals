import json
import re
from xml.sax.saxutils import escape as xml_escape
from django.conf import settings
from django.http import HttpResponse, Http404
from django.utils.html import escape as html_escape

from apps.products.models import Product, Category, Brand
from apps.products.services_indexnow import get_indexnow_api_key, get_site_url, get_site_domain


TN_DISTRICTS = [
    ("ariyalur", "Ariyalur"),
    ("chengalpattu", "Chengalpattu"),
    ("chennai", "Chennai"),
    ("coimbatore", "Coimbatore"),
    ("cuddalore", "Cuddalore"),
    ("dharmapuri", "Dharmapuri"),
    ("dindigul", "Dindigul"),
    ("erode", "Erode"),
    ("kallakurichi", "Kallakurichi"),
    ("kancheepuram", "Kancheepuram"),
    ("kanniyakumari", "Kanniyakumari"),
    ("karur", "Karur"),
    ("krishnagiri", "Krishnagiri"),
    ("madurai", "Madurai"),
    ("mayiladuthurai", "Mayiladuthurai"),
    ("nagapattinam", "Nagapattinam"),
    ("namakkal", "Namakkal"),
    ("perambalur", "Perambalur"),
    ("pudukkottai", "Pudukkottai"),
    ("ramanathapuram", "Ramanathapuram"),
    ("ranipet", "Ranipet"),
    ("salem", "Salem"),
    ("sivaganga", "Sivaganga"),
    ("tenkasi", "Tenkasi"),
    ("thanjavur", "Thanjavur"),
    ("theni", "Theni"),
    ("the-nilgiris", "The Nilgiris"),
    ("thoothukudi", "Thoothukudi"),
    ("tiruchirappalli", "Tiruchirappalli"),
    ("tirunelveli", "Tirunelveli"),
    ("tirupathur", "Tirupathur"),
    ("tiruppur", "Tiruppur"),
    ("tiruvallur", "Tiruvallur"),
    ("tiruvannamalai", "Tiruvannamalai"),
    ("tiruvarur", "Tiruvarur"),
    ("vellore", "Vellore"),
    ("viluppuram", "Viluppuram"),
    ("virudhunagar", "Virudhunagar"),
]

GUIDE_SLUGS = [
    ("wire-selection-guide", "Complete Electrical Wire Selection Guide: Gauge, Current Ratings & Fire Safety"),
    ("mcb-rccb-guide", "MCB vs. RCCB: Complete Circuit Protection & Human Shock Safety Guide"),
    ("modular-switches-guide", "Modular Switches & Designer Faceplates: Architect & Electrician Buying Guide"),
    ("led-lighting-guide", "LED Lighting Wattage, Lumens & Color Temperature Guide for Homes & Offices"),
    ("bldc-ceiling-fans-guide", "BLDC Ceiling Fans vs. Induction Fans: Power Savings & Inverter Performance"),
    ("industrial-switchgear-guide", "Industrial Switchgear & Motor Protection: MCCBs, Contactors & Overload Relays"),
    ("electrical-conduit-guide", "Conduit Pipes, Gang Boxes & Accessories: Complete Concealed Wiring Installation"),
    ("contractor-buying-guide", "Electrical Contractor Procurement Guide: GST Invoicing, Project BOQs & Bulk Supply"),
    ("residential-electrical-safety-checklist", "Residential Electrical Safety Checklist: 10 Critical Checks Every Homeowner Must Perform"),
    ("agricultural-submersible-pump-cable-guide", "Agricultural Submersible Pump Cable & Motor Starter Sizing Guide"),
]

CATEGORY_SLUGS = [
    ("fans", "Fans & Ventilation"),
    ("wires-cables", "Wires & Cables"),
    ("switches", "Modular Switches & Sockets"),
    ("led-lighting", "LED Lighting & Battens"),
    ("mcb-protection", "MCB & Circuit Protection"),
    ("electrical-accessories", "Electrical Conduits & Accessories"),
]


def sitemap_xml(request):
    """
    Dynamic XML sitemap including published products, verified categories,
    in-stock brands, all 38 Tamil Nadu districts, technical guides, and public pages.
    Complies with Sitemaps 0.9 and Google Image sitemaps standards.
    """
    site_url = get_site_url()

    # Query active, indexable merchandise
    products = (
        Product.objects.filter(active=True, is_indexable=True)
        .select_related('brand', 'category')
        .prefetch_related('images')
        .order_by('-updated_at')
    )

    # Only include brands that have at least 1 published product in inventory!
    # (Complies with Phase 3 Rule: Do not index empty, low-value brand pages)
    active_brand_ids = set(products.values_list('brand_id', flat=True).distinct())
    in_stock_brands = Brand.objects.filter(id__in=active_brand_ids, is_active=True).order_by('name')

    xml_lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" '
        'xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
    ]

    def add_url(loc, lastmod=None, changefreq='weekly', priority='0.8', image_url=None, image_title=None):
        xml_lines.append('  <url>')
        xml_lines.append(f'    <loc>{xml_escape(loc)}</loc>')
        if lastmod:
            xml_lines.append(f'    <lastmod>{lastmod}</lastmod>')
        xml_lines.append(f'    <changefreq>{changefreq}</changefreq>')
        xml_lines.append(f'    <priority>{priority}</priority>')
        if image_url:
            full_img = image_url if image_url.startswith('http') else f"{site_url}{image_url}"
            xml_lines.append('    <image:image>')
            xml_lines.append(f'      <image:loc>{xml_escape(full_img)}</image:loc>')
            if image_title:
                xml_lines.append(f'      <image:title>{xml_escape(image_title)}</image:title>')
            xml_lines.append('    </image:image>')
        xml_lines.append('  </url>')

    # 1. Primary Core Pages
    add_url(f"{site_url}/", changefreq='daily', priority='1.0')
    add_url(f"{site_url}/shop", changefreq='daily', priority='0.9')
    add_url(f"{site_url}/categories", changefreq='weekly', priority='0.8')
    add_url(f"{site_url}/brands", changefreq='weekly', priority='0.8')
    add_url(f"{site_url}/locations/tamil-nadu", changefreq='weekly', priority='0.9')
    add_url(f"{site_url}/guides", changefreq='weekly', priority='0.8')

    # 2. Informational Pages
    add_url(f"{site_url}/about", changefreq='monthly', priority='0.6')
    add_url(f"{site_url}/contact", changefreq='monthly', priority='0.6')

    # 3. Mandatory Public Policy Pages
    add_url(f"{site_url}/privacy-policy", changefreq='monthly', priority='0.5')
    add_url(f"{site_url}/terms-and-conditions", changefreq='monthly', priority='0.5')
    add_url(f"{site_url}/shipping-policy", changefreq='monthly', priority='0.5')
    add_url(f"{site_url}/return-policy", changefreq='monthly', priority='0.5')

    # 4. Seven Category SEO Landing Pages
    for cat_slug, cat_title in CATEGORY_SLUGS:
        add_url(
            f"{site_url}/categories/{cat_slug}",
            changefreq='weekly',
            priority='0.85',
            image_title=f"{cat_title} at Vee Power Electricals",
        )

    # 5. In-Stock Brand Landing Pages (ONLY brands with >0 inventory)
    for brand in in_stock_brands:
        brand_date = brand.updated_at.strftime('%Y-%m-%d') if brand.updated_at else None
        add_url(
            f"{site_url}/brands/{brand.slug}",
            lastmod=brand_date,
            changefreq='weekly',
            priority='0.8',
            image_url=brand.logo_url or None,
            image_title=f"{brand.name} Electricals at Vee Power",
        )

    # 6. All 38 Tamil Nadu District Location Landing Pages
    for dist_slug, dist_name in TN_DISTRICTS:
        priority = '0.85' if dist_slug == 'coimbatore' else '0.75'
        add_url(
            f"{site_url}/locations/tamil-nadu/{dist_slug}",
            changefreq='monthly',
            priority=priority,
            image_title=f"Electrical supplies in {dist_name}, Tamil Nadu",
        )

    # 7. Ten Educational Buyer Guides
    for guide_slug, guide_title in GUIDE_SLUGS:
        add_url(
            f"{site_url}/guides/{guide_slug}",
            changefreq='monthly',
            priority='0.75',
            image_title=guide_title,
        )

    # 8. Published In-Stock Products
    for prod in products:
        prod_date = prod.updated_at.strftime('%Y-%m-%d') if prod.updated_at else None
        priority = '0.9' if prod.featured else '0.8'
        primary_img = prod.primary_image or ''
        img_title = f"{prod.brand.name if prod.brand else ''} {prod.name}".strip()
        add_url(
            f"{site_url}/product/{prod.slug}",
            lastmod=prod_date,
            changefreq='weekly',
            priority=priority,
            image_url=primary_img or None,
            image_title=img_title,
        )

    xml_lines.append('</urlset>')
    content = '\n'.join(xml_lines)

    response = HttpResponse(content, content_type='application/xml; charset=utf-8')
    response['Cache-Control'] = 'public, max-age=3600, s-maxage=3600'
    return response


def robots_txt(request):
    """
    Standard-compliant robots.txt allowing search crawlers access to public catalog,
    categories, brands, locations, guides, and XML feeds while protecting administrative,
    authenticated, cart, and checkout paths.
    """
    site_url = get_site_url()
    lines = [
        "User-agent: *",
        "Allow: /",
        "Allow: /shop",
        "Allow: /product/",
        "Allow: /categories",
        "Allow: /categories/",
        "Allow: /brands",
        "Allow: /brands/",
        "Allow: /locations/",
        "Allow: /guides",
        "Allow: /guides/",
        "Allow: /feeds/",
        "Allow: /about",
        "Allow: /contact",
        "Allow: /privacy-policy",
        "Allow: /terms-and-conditions",
        "Allow: /shipping-policy",
        "Allow: /return-policy",
        "Allow: /media/",
        "Allow: /assets/",
        "Allow: /static/",
        "",
        "# Disallow administrative, authenticated customer, cart, and checkout paths",
        "Disallow: /admin/",
        "Disallow: /django-admin/",
        "Disallow: /api/",
        "Disallow: /auth/",
        "Disallow: /login",
        "Disallow: /register",
        "Disallow: /forgot-password",
        "Disallow: /reset-password",
        "Disallow: /cart",
        "Disallow: /checkout",
        "Disallow: /account",
        "Disallow: /order-success",
        "",
        f"Sitemap: {site_url}/sitemap.xml",
    ]
    response = HttpResponse('\n'.join(lines), content_type='text/plain; charset=utf-8')
    response['Cache-Control'] = 'public, max-age=86400, s-maxage=86400'
    return response


def google_shopping_feed(request):
    """
    Dynamic Google Shopping / Google Merchant Center XML product feed (RSS 2.0 with g namespace).
    Supplies in-stock, published products with verified prices in INR, SKUs, and availability.
    """
    site_url = get_site_url()

    products = (
        Product.objects.filter(active=True, is_indexable=True)
        .select_related('brand', 'category')
        .prefetch_related('images')
        .order_by('id')
    )

    xml_lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
        '  <channel>',
        '    <title>Vee Power Electricals - Google Shopping Feed</title>',
        f'    <link>{site_url}</link>',
        '    <description>Authorized electrical products, wires, switchgear, LED lighting, and fans in Coimbatore, Tamil Nadu, India.</description>',
    ]

    for p in products:
        item_id = xml_escape(p.sku or f"VEE-{p.id}")
        title = xml_escape(p.name)
        description = xml_escape(p.description or f"Genuine {p.name} supplied by Vee Power Electricals.")
        link = xml_escape(f"{site_url}/product/{p.slug}")
        img_url = p.primary_image or f"{site_url}/logo.png"
        if not img_url.startswith('http'):
            img_url = f"{site_url}{img_url}"
        img_url = xml_escape(img_url)

        brand_name = xml_escape(p.brand.name if p.brand else "Vee Power")
        cat_name = xml_escape(p.category.name if p.category else "Electrical Supplies")
        availability = "in_stock" if p.stock > 0 else "out_of_stock"
        price_str = f"{p.price:.2f} INR"

        xml_lines.append('    <item>')
        xml_lines.append(f'      <g:id>{item_id}</g:id>')
        xml_lines.append(f'      <g:title>{title}</g:title>')
        xml_lines.append(f'      <g:description>{description}</g:description>')
        xml_lines.append(f'      <g:link>{link}</g:link>')
        xml_lines.append(f'      <g:image_link>{img_url}</g:image_link>')
        xml_lines.append(f'      <g:condition>new</g:condition>')
        xml_lines.append(f'      <g:availability>{availability}</g:availability>')
        xml_lines.append(f'      <g:price>{price_str}</g:price>')
        xml_lines.append(f'      <g:brand>{brand_name}</g:brand>')
        xml_lines.append(f'      <g:product_type>{cat_name}</g:product_type>')
        xml_lines.append(f'      <g:identifier_exists>yes</g:identifier_exists>')
        xml_lines.append('      <g:shipping>')
        xml_lines.append('        <g:country>IN</g:country>')
        xml_lines.append('        <g:service>Standard Road Freight &amp; Courier</g:service>')
        xml_lines.append('        <g:price>0.00 INR</g:price>')
        xml_lines.append('      </g:shipping>')
        xml_lines.append('    </item>')

    xml_lines.append('  </channel>')
    xml_lines.append('</rss>')

    content = '\n'.join(xml_lines)
    response = HttpResponse(content, content_type='application/xml; charset=utf-8')
    response['Cache-Control'] = 'public, max-age=7200, s-maxage=7200'
    return response


def indexnow_key_verify(request, key):
    """
    Serves the IndexNow verification key file at /<key>.txt for Bing & Yandex.
    """
    expected_key = get_indexnow_api_key()
    if key == expected_key:
        response = HttpResponse(key, content_type='text/plain; charset=utf-8')
        response['Cache-Control'] = 'public, max-age=86400'
        return response
    raise Http404("IndexNow verification key not found.")


def seo_render(request):
    """
    Server-rendered, crawlable HTML endpoint for search engine bots and social scrapers
    (Googlebot, Bingbot, Yandex, DuckDuckGo, Facebook, Twitter, WhatsApp).
    Delivers fully rendered title, meta description, canonical URL, Open Graph,
    Twitter Cards, and Schema.org JSON-LD microdata without client JS execution requirement.
    """
    path = request.GET.get('path', '/').strip()
    if not path.startswith('/'):
        path = '/' + path

    site_url = get_site_url()
    site_domain = get_site_domain()

    # 1. Product Detail Page Crawler Prerender
    product_match = re.match(r'^/product/([a-zA-Z0-9_-]+)/?$', path)
    if product_match:
        identifier = product_match.group(1)
        if identifier.isdigit():
            prod = Product.objects.filter(id=int(identifier)).select_related('brand', 'category', 'subcategory').prefetch_related('images', 'specifications').first()
        else:
            prod = Product.objects.filter(slug=identifier).select_related('brand', 'category', 'subcategory').prefetch_related('images', 'specifications').first()

        if not prod or not prod.active or not prod.is_indexable:
            return _render_404_html(site_url, "Product not found or currently unavailable.")

        return _render_product_seo_html(prod, site_url, site_domain)

    # 2. Homepage Crawler Prerender
    if path in ('/', ''):
        return _render_home_seo_html(site_url, site_domain)

    # 3. Category Landing Pages
    cat_match = re.match(r'^/categories/([a-zA-Z0-9_-]+)/?$', path)
    if cat_match:
        cat_slug = cat_match.group(1).lower()
        return _render_category_detail_seo_html(cat_slug, site_url, site_domain)

    if path in ('/categories', '/categories/'):
        return _render_categories_seo_html(site_url, site_domain)

    # 4. Brand Landing Pages
    brand_match = re.match(r'^/brands/([a-zA-Z0-9_-]+)/?$', path)
    if brand_match:
        brand_slug = brand_match.group(1).lower()
        return _render_brand_detail_seo_html(brand_slug, site_url, site_domain)

    if path in ('/brands', '/brands/'):
        return _render_brands_seo_html(site_url, site_domain)

    # 5. Tamil Nadu District Locations
    if path in ('/locations/tamil-nadu', '/locations/tamil-nadu/'):
        return _render_tn_hub_seo_html(site_url, site_domain)

    district_match = re.match(r'^/locations/tamil-nadu/([a-zA-Z0-9_-]+)/?$', path)
    if district_match:
        dist_slug = district_match.group(1).lower()
        return _render_district_seo_html(dist_slug, site_url, site_domain)

    # 6. Educational Buyer Guides
    if path in ('/guides', '/guides/'):
        return _render_guides_index_seo_html(site_url, site_domain)

    guide_match = re.match(r'^/guides/([a-zA-Z0-9_-]+)/?$', path)
    if guide_match:
        guide_slug = guide_match.group(1).lower()
        return _render_guide_detail_seo_html(guide_slug, site_url, site_domain)

    # 7. Shop Catalog
    if path.startswith('/shop'):
        return _render_shop_seo_html(path, site_url, site_domain)

    # 8. Informational Pages
    if path in ('/about', '/about/'):
        return _render_info_seo_html(
            title="About Us | Vee Power Electricals",
            description="Learn about Vee Power Electricals, Coimbatore's trusted distributor of genuine electrical equipment, industrial switchgear, wires, and lighting.",
            canonical=f"{site_url}/about",
            heading="About Vee Power Electricals",
            content="Vee Power Electricals is a premier electrical distribution company based in Coimbatore, Tamil Nadu, offering certified products from industry-leading manufacturers including Havells, Polycab, Finolex, Philips, Legrand, and Schneider Electric.",
            site_url=site_url,
        )

    if path in ('/contact', '/contact/'):
        return _render_info_seo_html(
            title="Contact Us | Vee Power Electricals",
            description="Get in touch with Vee Power Electricals in Coimbatore for electrical inquiries, quotations, and wholesale orders. Phone: +91-94432-23456.",
            canonical=f"{site_url}/contact",
            heading="Contact Vee Power Electricals",
            content="Contact our sales and technical support team for genuine electrical goods, contractor pricing, and quotation assistance. Cross Cut Road, Gandhipuram, Coimbatore, Tamil Nadu 641012.",
            site_url=site_url,
        )

    # 9. Policies
    policy_map = {
        '/privacy': ('Privacy Policy', 'Read Vee Power Electricals privacy policy detailing our customer data protection, security practices, and privacy standards.'),
        '/privacy-policy': ('Privacy Policy', 'Read Vee Power Electricals privacy policy detailing our customer data protection, security practices, and privacy standards.'),
        '/terms': ('Terms and Conditions', 'Review terms and conditions for shopping at Vee Power Electricals online store.'),
        '/terms-and-conditions': ('Terms and Conditions', 'Review terms and conditions for shopping at Vee Power Electricals online store.'),
        '/shipping': ('Shipping Policy', 'Learn about Vee Power Electricals shipping times, reliable courier partners, and order tracking across India.'),
        '/shipping-policy': ('Shipping Policy', 'Learn about Vee Power Electricals shipping times, reliable courier partners, and order tracking across India.'),
        '/returns': ('Return & Cancellation Policy', 'Understand Vee Power Electricals return, replacement, and cancellation guidelines for electrical goods.'),
        '/return-policy': ('Return & Cancellation Policy', 'Understand Vee Power Electricals return, replacement, and cancellation guidelines for electrical goods.'),
    }

    clean_path = path.rstrip('/')
    if clean_path in policy_map:
        policy_title, policy_desc = policy_map[clean_path]
        return _render_info_seo_html(
            title=f"{policy_title} | Vee Power Electricals",
            description=policy_desc,
            canonical=f"{site_url}{clean_path}",
            heading=policy_title,
            content=f"Official {policy_title} for Vee Power Electricals customers and wholesale partners.",
            site_url=site_url,
        )

    return _render_404_html(site_url, "The requested page was not found.")


def _render_product_seo_html(product, site_url, site_domain):
    brand_name = product.brand.name if product.brand else 'Vee Power'
    cat_name = product.category.name if product.category else 'Electrical'
    canonical_url = product.canonical_url or f"{site_url}/product/{product.slug}"
    img_url = product.primary_image or f"{site_url}/logo.png"
    if not img_url.startswith('http'):
        img_url = f"{site_url}{img_url}"

    title = product.meta_title or f"{product.name} | {brand_name} | Vee Power Electricals"
    description = product.meta_description or f"Buy genuine {brand_name} {product.name} at ₹{product.price} INR from Vee Power Electricals."

    availability_schema = "https://schema.org/InStock" if product.stock > 0 else "https://schema.org/OutOfStock"
    avail_label = "In Stock" if product.stock > 0 else "Out of Stock"

    # Schema.org JSON-LD Product & BreadcrumbList
    schema_data = [
        {
            "@context": "https://schema.org",
            "@type": "Product",
            "name": product.name,
            "image": [img_url],
            "description": product.description or description,
            "sku": product.sku,
            "brand": {
                "@type": "Brand",
                "name": brand_name,
            },
            "category": cat_name,
            "offers": {
                "@type": "Offer",
                "url": canonical_url,
                "priceCurrency": "INR",
                "price": str(product.price),
                "priceValidUntil": "2027-12-31",
                "itemCondition": "https://schema.org/NewCondition",
                "availability": availability_schema,
                "seller": {
                    "@type": "Organization",
                    "name": "Vee Power Electricals",
                    "url": site_url,
                }
            }
        },
        {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": "Home", "item": site_url},
                {"@type": "ListItem", "position": 2, "name": "Shop", "item": f"{site_url}/shop"},
                {"@type": "ListItem", "position": 3, "name": cat_name, "item": f"{site_url}/shop?category={product.category.slug if product.category else ''}"},
                {"@type": "ListItem", "position": 4, "name": product.name, "item": canonical_url},
            ]
        }
    ]

    specs = list(product.specifications.all())
    specs_html = ""
    if specs:
        rows = "".join([f"<tr><th style='text-align:left;padding:8px;border:1px solid #ddd'>{html_escape(s.spec_key)}</th><td style='padding:8px;border:1px solid #ddd'>{html_escape(s.spec_value)}</td></tr>" for s in specs])
        specs_html = f"<div style='margin-top:24px'><h3>Technical Specifications</h3><table style='width:100%;border-collapse:collapse'>{rows}</table></div>"

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>{html_escape(title)}</title>
  <meta name="description" content="{html_escape(description)}">
  <link rel="canonical" href="{html_escape(canonical_url)}">
  <meta name="robots" content="index, follow">
  <meta property="og:type" content="product">
  <meta property="og:title" content="{html_escape(title)}">
  <meta property="og:description" content="{html_escape(description)}">
  <meta property="og:url" content="{html_escape(canonical_url)}">
  <meta property="og:image" content="{html_escape(img_url)}">
  <meta property="product:price:amount" content="{product.price}">
  <meta property="product:price:currency" content="INR">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{html_escape(title)}">
  <meta name="twitter:description" content="{html_escape(description)}">
  <meta name="twitter:image" content="{html_escape(img_url)}">
  <script type="application/ld+json">{json.dumps(schema_data)}</script>
</head>
<body style="font-family:sans-serif;max-width:900px;margin:40px auto;padding:0 20px;line-height:1.6;color:#1e293b">
  <nav style="font-size:14px;margin-bottom:20px;color:#64748b">
    <a href="{site_url}/">Home</a> &gt;
    <a href="{site_url}/shop">Shop</a> &gt;
    <a href="{site_url}/shop?category={product.category.slug if product.category else ''}">{html_escape(cat_name)}</a> &gt;
    <span>{html_escape(product.name)}</span>
  </nav>
  <article>
    <div style="display:flex;gap:40px;flex-wrap:wrap">
      <div style="flex:1;min-width:300px">
        <img src="{html_escape(img_url)}" alt="{html_escape(product.name)}" style="width:100%;max-width:400px;border-radius:8px;border:1px solid #e2e8f0">
      </div>
      <div style="flex:1;min-width:300px">
        <span style="font-size:12px;font-weight:bold;color:#0284c7;text-transform:uppercase">{html_escape(brand_name)}</span>
        <h1 style="font-size:28px;margin:8px 0">{html_escape(product.name)}</h1>
        <p style="font-size:14px;color:#64748b">SKU: {html_escape(product.sku or 'N/A')}</p>
        <p style="font-size:24px;font-weight:bold;color:#0f172a;margin:16px 0">₹{product.price} <span style="font-size:14px;color:#64748b;font-weight:normal">INR (Incl. GST)</span></p>
        <p style="font-size:14px;font-weight:600;color:{'#16a34a' if product.stock > 0 else '#dc2626'}">{avail_label}</p>
        <div style="margin:20px 0;padding:16px;background:#f8fafc;border-radius:8px">
          <p style="margin:0;font-size:15px">{html_escape(product.description or '')}</p>
        </div>
        <p><a href="{canonical_url}" style="display:inline-block;padding:12px 24px;background:#0284c7;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold">View and Purchase on Vee Power</a></p>
      </div>
    </div>
    {specs_html}
  </article>
</body>
</html>"""
    resp = HttpResponse(html, content_type='text/html; charset=utf-8')
    resp['Cache-Control'] = 'public, max-age=1800'
    return resp


def _render_home_seo_html(site_url, site_domain):
    title = "Vee Power Electricals | Authorized Electrical Supplier Coimbatore & Tamil Nadu"
    description = "Buy certified electrical products from Havells, Polycab, Finolex, Philips, Legrand, and Schneider Electric at Vee Power Electricals. Fast delivery across all 38 Tamil Nadu districts."
    canonical = f"{site_url}/"

    schema_data = [
        {
            "@context": "https://schema.org",
            "@type": "ElectricalSupplyStore",
            "name": "Vee Power Electricals",
            "url": site_url,
            "logo": f"{site_url}/logo.png",
            "description": description,
            "telephone": "+91-94432-23456",
            "address": {
                "@type": "PostalAddress",
                "streetAddress": "Cross Cut Road, Gandhipuram",
                "addressLocality": "Coimbatore",
                "addressRegion": "Tamil Nadu",
                "postalCode": "641012",
                "addressCountry": "IN"
            },
            "geo": {
                "@type": "GeoCoordinates",
                "latitude": 11.0168,
                "longitude": 76.9558
            },
            "openingHoursSpecification": {
                "@type": "OpeningHoursSpecification",
                "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
                "opens": "09:00",
                "closes": "20:30"
            }
        },
        {
            "@context": "https://schema.org",
            "@type": "WebSite",
            "name": "Vee Power Electricals",
            "url": site_url,
            "potentialAction": {
                "@type": "SearchAction",
                "target": f"{site_url}/shop?search={{search_term_string}}",
                "query-input": "required name=search_term_string"
            }
        }
    ]

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>{html_escape(title)}</title>
  <meta name="description" content="{html_escape(description)}">
  <link rel="canonical" href="{html_escape(canonical)}">
  <meta name="robots" content="index, follow">
  <meta property="og:type" content="website">
  <meta property="og:title" content="{html_escape(title)}">
  <meta property="og:description" content="{html_escape(description)}">
  <meta property="og:url" content="{html_escape(canonical)}">
  <meta name="twitter:card" content="summary_large_image">
  <script type="application/ld+json">{json.dumps(schema_data)}</script>
</head>
<body style="font-family:sans-serif;max-width:900px;margin:40px auto;padding:0 20px;line-height:1.6;color:#1e293b">
  <header>
    <h1>Vee Power Electricals - Coimbatore &amp; Tamil Nadu</h1>
    <p>{html_escape(description)}</p>
  </header>
  <section style="margin:30px 0">
    <h2>Certified Electrical Categories</h2>
    <ul>
      <li><a href="{site_url}/categories/fans">Ceiling &amp; Exhaust Fans (Havells, Crompton)</a></li>
      <li><a href="{site_url}/categories/wires-cables">Flame Retardant Wires &amp; Cables (Polycab, Finolex)</a></li>
      <li><a href="{site_url}/categories/switches">Modular Switches &amp; Sockets (Legrand, Schneider)</a></li>
      <li><a href="{site_url}/categories/led-lighting">Energy-Efficient LED Lighting (Philips)</a></li>
      <li><a href="{site_url}/categories/mcb-protection">MCB, RCCB &amp; Distribution Boards (Legrand, Schneider)</a></li>
      <li><a href="{site_url}/categories/electrical-accessories">Electrical Conduits &amp; Installation Accessories</a></li>
    </ul>
  </section>
  <section style="margin:30px 0">
    <h2>Statewide Tamil Nadu Delivery (All 38 Districts)</h2>
    <p>We deliver certified electrical supplies from our Coimbatore warehouse across all 38 districts of Tamil Nadu. <a href="{site_url}/locations/tamil-nadu">View Tamil Nadu Delivery Hub</a>.</p>
  </section>
  <section style="margin:30px 0">
    <h2>Technical Buyer Guides</h2>
    <p>Read our engineering guides on copper wire gauge sizing, MCB vs RCCB selection, and commercial contractor procurement. <a href="{site_url}/guides">Browse Buyer Guides</a>.</p>
  </section>
</body>
</html>"""
    resp = HttpResponse(html, content_type='text/html; charset=utf-8')
    resp['Cache-Control'] = 'public, max-age=3600'
    return resp


def _render_category_detail_seo_html(slug, site_url, site_domain):
    cat_names = dict(CATEGORY_SLUGS)
    if slug not in cat_names:
        return _render_404_html(site_url, "Category not found.")

    name = cat_names[slug]
    title = f"{name} | Vee Power Electricals Coimbatore"
    description = f"Buy genuine {name} with verified manufacturer warranty at Vee Power Electricals. Fast delivery across Tamil Nadu."
    canonical = f"{site_url}/categories/{slug}"

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>{html_escape(title)}</title>
  <meta name="description" content="{html_escape(description)}">
  <link rel="canonical" href="{html_escape(canonical)}">
  <meta name="robots" content="index, follow">
</head>
<body style="font-family:sans-serif;max-width:900px;margin:40px auto;padding:0 20px;line-height:1.6">
  <nav><a href="{site_url}/">Home</a> &gt; <a href="{site_url}/categories">Categories</a> &gt; <span>{html_escape(name)}</span></nav>
  <h1>{html_escape(name)}</h1>
  <p>{html_escape(description)}</p>
  <p><a href="{canonical}">View products in {html_escape(name)}</a></p>
</body>
</html>"""
    resp = HttpResponse(html, content_type='text/html; charset=utf-8')
    resp['Cache-Control'] = 'public, max-age=3600'
    return resp


def _render_brand_detail_seo_html(slug, site_url, site_domain):
    # Check if brand exists and has products
    brand = Brand.objects.filter(slug=slug).first()
    has_products = Product.objects.filter(brand__slug=slug, active=True, is_indexable=True).exists() if brand else False

    brand_name = brand.name if brand else slug.title()
    title = f"{brand_name} Electrical Products | Vee Power Electricals"
    description = f"Explore {brand_name} electrical equipment, switchgear, and accessories at Vee Power Electricals."
    canonical = f"{site_url}/brands/{slug}"
    robots = "index, follow" if has_products else "noindex, follow"

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>{html_escape(title)}</title>
  <meta name="description" content="{html_escape(description)}">
  <link rel="canonical" href="{html_escape(canonical)}">
  <meta name="robots" content="{robots}">
</head>
<body style="font-family:sans-serif;max-width:900px;margin:40px auto;padding:0 20px;line-height:1.6">
  <nav><a href="{site_url}/">Home</a> &gt; <a href="{site_url}/brands">Brands</a> &gt; <span>{html_escape(brand_name)}</span></nav>
  <h1>{html_escape(brand_name)} Electricals</h1>
  <p>{html_escape(description)}</p>
  <p><a href="{canonical}">View brand catalog</a></p>
</body>
</html>"""
    resp = HttpResponse(html, content_type='text/html; charset=utf-8')
    resp['Cache-Control'] = 'public, max-age=3600'
    return resp


def _render_tn_hub_seo_html(site_url, site_domain):
    title = "Electrical Supplies Delivery Across All 38 Tamil Nadu Districts | Vee Power"
    description = "Fast dispatch of genuine electrical cables, switchgear, LED lighting, and fans across all 38 districts of Tamil Nadu from our Coimbatore warehouse."
    canonical = f"{site_url}/locations/tamil-nadu"

    dist_links = "".join([f"<li><a href='{site_url}/locations/tamil-nadu/{slug}'>{name} District</a></li>" for slug, name in TN_DISTRICTS])

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>{html_escape(title)}</title>
  <meta name="description" content="{html_escape(description)}">
  <link rel="canonical" href="{html_escape(canonical)}">
  <meta name="robots" content="index, follow">
</head>
<body style="font-family:sans-serif;max-width:900px;margin:40px auto;padding:0 20px;line-height:1.6">
  <nav><a href="{site_url}/">Home</a> &gt; <span>Tamil Nadu Delivery Locations</span></nav>
  <h1>Tamil Nadu Electrical Distribution Network</h1>
  <p>{html_escape(description)}</p>
  <h2>All 38 Districts Covered:</h2>
  <ul>{dist_links}</ul>
</body>
</html>"""
    resp = HttpResponse(html, content_type='text/html; charset=utf-8')
    resp['Cache-Control'] = 'public, max-age=86400'
    return resp


def _render_district_seo_html(slug, site_url, site_domain):
    dist_map = dict(TN_DISTRICTS)
    if slug not in dist_map:
        return _render_404_html(site_url, "Tamil Nadu district location not found.")

    name = dist_map[slug]
    title = f"Electrical Products & Supplies in {name}, Tamil Nadu | Vee Power"
    description = f"Order genuine ISI electrical cables, switchgear, LED lighting, and fans in {name}. Express delivery from Vee Power Electricals Coimbatore."
    canonical = f"{site_url}/locations/tamil-nadu/{slug}"

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>{html_escape(title)}</title>
  <meta name="description" content="{html_escape(description)}">
  <link rel="canonical" href="{html_escape(canonical)}">
  <meta name="robots" content="index, follow">
</head>
<body style="font-family:sans-serif;max-width:900px;margin:40px auto;padding:0 20px;line-height:1.6">
  <nav><a href="{site_url}/">Home</a> &gt; <a href="{site_url}/locations/tamil-nadu">Tamil Nadu</a> &gt; <span>{html_escape(name)}</span></nav>
  <h1>Electrical Supplies in {html_escape(name)}, Tamil Nadu</h1>
  <p>{html_escape(description)}</p>
  <p><a href="{canonical}">View full district delivery info</a></p>
</body>
</html>"""
    resp = HttpResponse(html, content_type='text/html; charset=utf-8')
    resp['Cache-Control'] = 'public, max-age=86400'
    return resp


def _render_guides_index_seo_html(site_url, site_domain):
    title = "Electrical Technical & Buying Guides | Vee Power Electricals"
    description = "Comprehensive technical guides on wire gauge sizing, MCB & RCCB circuit protection, modular switches, and contractor procurement."
    canonical = f"{site_url}/guides"

    guide_links = "".join([f"<li><a href='{site_url}/guides/{slug}'>{title}</a></li>" for slug, title in GUIDE_SLUGS])

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>{html_escape(title)}</title>
  <meta name="description" content="{html_escape(description)}">
  <link rel="canonical" href="{html_escape(canonical)}">
  <meta name="robots" content="index, follow">
</head>
<body style="font-family:sans-serif;max-width:900px;margin:40px auto;padding:0 20px;line-height:1.6">
  <nav><a href="{site_url}/">Home</a> &gt; <span>Technical Guides</span></nav>
  <h1>Electrical Engineering &amp; Buyer Guides</h1>
  <p>{html_escape(description)}</p>
  <ul>{guide_links}</ul>
</body>
</html>"""
    resp = HttpResponse(html, content_type='text/html; charset=utf-8')
    resp['Cache-Control'] = 'public, max-age=86400'
    return resp


def _render_guide_detail_seo_html(slug, site_url, site_domain):
    guide_map = dict(GUIDE_SLUGS)
    if slug not in guide_map:
        return _render_404_html(site_url, "Technical guide not found.")

    title = guide_map[slug]
    meta_title = f"{title} | Vee Power Electricals"
    description = f"Read our comprehensive engineering guide on {title}. Practical calculations and code-compliant electrical recommendations."
    canonical = f"{site_url}/guides/{slug}"

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>{html_escape(meta_title)}</title>
  <meta name="description" content="{html_escape(description)}">
  <link rel="canonical" href="{html_escape(canonical)}">
  <meta name="robots" content="index, follow">
</head>
<body style="font-family:sans-serif;max-width:900px;margin:40px auto;padding:0 20px;line-height:1.6">
  <nav><a href="{site_url}/">Home</a> &gt; <a href="{site_url}/guides">Guides</a> &gt; <span>{html_escape(title)}</span></nav>
  <h1>{html_escape(title)}</h1>
  <p>{html_escape(description)}</p>
  <p><a href="{canonical}">Read the interactive guide</a></p>
</body>
</html>"""
    resp = HttpResponse(html, content_type='text/html; charset=utf-8')
    resp['Cache-Control'] = 'public, max-age=86400'
    return resp


def _render_shop_seo_html(path, site_url, site_domain):
    title = "Shop Electrical Equipment & Supplies | Vee Power Electricals"
    description = "Browse certified electrical cables, fans, modular switches, and circuit protection devices from Havells, Polycab, Finolex, and Legrand."
    canonical = f"{site_url}/shop"

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>{html_escape(title)}</title>
  <meta name="description" content="{html_escape(description)}">
  <link rel="canonical" href="{html_escape(canonical)}">
  <meta name="robots" content="index, follow">
</head>
<body style="font-family:sans-serif;max-width:900px;margin:40px auto;padding:0 20px;line-height:1.6">
  <h1>Shop Electrical Products</h1>
  <p>{html_escape(description)}</p>
  <p><a href="{site_url}/shop">Explore full catalog</a></p>
</body>
</html>"""
    return HttpResponse(html, content_type='text/html; charset=utf-8')


def _render_categories_seo_html(site_url, site_domain):
    title = "Electrical Product Categories | Vee Power Electricals"
    description = "Explore all electrical categories: Wires & Cables, MCBs & Distribution, Modular Switches, Ceiling Fans, and LED Lighting."
    canonical = f"{site_url}/categories"

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>{html_escape(title)}</title>
  <meta name="description" content="{html_escape(description)}">
  <link rel="canonical" href="{html_escape(canonical)}">
  <meta name="robots" content="index, follow">
</head>
<body style="font-family:sans-serif;max-width:900px;margin:40px auto;padding:0 20px;line-height:1.6">
  <h1>Electrical Categories</h1>
  <p>{html_escape(description)}</p>
  <p><a href="{site_url}/categories">Browse categories</a></p>
</body>
</html>"""
    return HttpResponse(html, content_type='text/html; charset=utf-8')


def _render_brands_seo_html(site_url, site_domain):
    title = "Certified Electrical Brands | Vee Power Electricals"
    description = "Browse certified electrical manufacturers: Havells, Polycab, Finolex, Philips, Legrand, and Schneider Electric at Vee Power Electricals."
    canonical = f"{site_url}/brands"

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>{html_escape(title)}</title>
  <meta name="description" content="{html_escape(description)}">
  <link rel="canonical" href="{html_escape(canonical)}">
  <meta name="robots" content="index, follow">
</head>
<body style="font-family:sans-serif;max-width:900px;margin:40px auto;padding:0 20px;line-height:1.6">
  <h1>Certified Electrical Manufacturers</h1>
  <p>{html_escape(description)}</p>
  <p><a href="{site_url}/brands">View all brands</a></p>
</body>
</html>"""
    return HttpResponse(html, content_type='text/html; charset=utf-8')


def _render_info_seo_html(title, description, canonical, heading, content, site_url):
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>{html_escape(title)}</title>
  <meta name="description" content="{html_escape(description)}">
  <link rel="canonical" href="{html_escape(canonical)}">
  <meta name="robots" content="index, follow">
</head>
<body style="font-family:sans-serif;max-width:900px;margin:40px auto;padding:0 20px;line-height:1.6">
  <nav><a href="{site_url}/">Home</a> &gt; <span>{html_escape(heading)}</span></nav>
  <h1>{html_escape(heading)}</h1>
  <p>{html_escape(content)}</p>
</body>
</html>"""
    resp = HttpResponse(html, content_type='text/html; charset=utf-8')
    resp['Cache-Control'] = 'public, max-age=86400'
    return resp


def _render_404_html(site_url, message):
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Page Not Found | Vee Power Electricals</title>
  <meta name="robots" content="noindex, follow">
</head>
<body style="font-family:sans-serif;max-width:600px;margin:60px auto;text-align:center">
  <h1>404 - Page Not Found</h1>
  <p>{html_escape(message)}</p>
  <p><a href="{site_url}/">Return to Homepage</a> | <a href="{site_url}/shop">Browse Shop</a></p>
</body>
</html>"""
    return HttpResponse(html, status=404, content_type='text/html; charset=utf-8')
