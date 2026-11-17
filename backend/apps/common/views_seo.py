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

BRAND_SEO_CONFIG = {
    "havells": {
        "slug": "havells",
        "name": "Havells",
        "meta_title": "Havells Electrical Products | Fans & Switchgear | Vee Power Electricals",
        "meta_description": "Buy genuine Havells ceiling fans, BLDC motors, and electrical equipment at Vee Power Electricals. Fast delivery across Tamil Nadu with manufacturer warranty.",
        "tagline": "India's Fast Moving Electrical Goods Pioneer",
        "overview": "Havells India Limited is a leading Fast Moving Electrical Goods (FMEG) company with an extensive global footprint. Renowned for design excellence, energy efficiency, and durable engineering, Havells produces high-grade domestic and commercial fans, lighting, industrial switchgear, and cables. Vee Power Electricals supplies authentic Havells electrical products in Coimbatore and across Tamil Nadu.",
        "origin": "India (Noida, Uttar Pradesh)",
        "series": ["Stealth Air BLDC", "Efficiencia Neo", "Enticer Art", "Fabio Switches"],
        "strengths": ["100% pure copper motor windings", "BEE 5-star energy saving ratings", "Corrosion-resistant dust-resistant coatings", "Pan-India authorized service network"],
        "is_indexable": True,
    },
    "polycab": {
        "slug": "polycab",
        "name": "Polycab",
        "meta_title": "Polycab Wires & Cables | FR & FR-LSH Copper Cables | Vee Power",
        "meta_description": "Order certified Polycab single-core and multi-core copper building wires (0.75 sq mm to 6.0 sq mm) at Vee Power Electricals Coimbatore. 100% original factory coils.",
        "tagline": "India's #1 Wires and Cables Manufacturer",
        "overview": "Polycab India Limited is India's largest manufacturer of wires and cables, commanding premier market leadership across domestic and industrial electrification projects. Engineered from >99.97% pure electrolytic grade copper conductors and proprietary flame retardant (FR and FR-LSH) PVC compounds, Polycab cables guarantee low resistance, superior power savings, and high fire safety. Vee Power Electricals supplies genuine sealed 90m and 180m coils.",
        "origin": "India (Mumbai, Maharashtra)",
        "series": ["Polycab Optima FR", "Polycab Green Wire FR-LSH", "HFX Flexible Multicore", "Submersible Flat 3-Core"],
        "strengths": [">99.97% electrolytic pure copper conductor", "Flame Retardant Low Smoke (FR-LSH) technology", "1100V grade IS 694 certification", "Tamper-evident holographic packaging"],
        "is_indexable": True,
    },
    "finolex": {
        "slug": "finolex",
        "name": "Finolex",
        "meta_title": "Finolex Cables & Wires | 100% Annealed Copper | Vee Power",
        "meta_description": "Purchase authentic Finolex flame retardant (FR) electrical copper wires at Vee Power Electricals. High dielectric strength, lead-free PVC insulation.",
        "tagline": "Total Cable Solutions & Unmatched Trust",
        "overview": "Finolex Cables Limited is one of India's most trusted manufacturers of electrical and telecommunication cables. Finolex electrical wires are manufactured using high-purity electrolytic grade bright annealed bare copper conductors drawn in-house and formulated with lead-free, flame retardant (FR) PVC compounds to prevent fire propagation during severe electrical faults.",
        "origin": "India (Pune, Maharashtra)",
        "series": ["Finolex Flame Retardant (FR)", "Finolex FR-LSH", "3-Core Submersible Cables", "LAN & Coaxial Cables"],
        "strengths": ["High-purity bare annealed copper", "High oxygen and temperature index PVC", "Smooth conduit glide formulation", "IS 694 / RoHS compliant"],
        "is_indexable": True,
    },
    "legrand": {
        "slug": "legrand",
        "name": "Legrand",
        "meta_title": "Legrand Modular Switches, Sockets & MCBs | Vee Power Electricals",
        "meta_description": "Shop Legrand Mylinc, Arteor, and DX3 circuit protection devices. Premium French electrical engineering, spark-resistant contacts, and architectural finishes.",
        "tagline": "Global Specialist in Electrical & Digital Building Infrastructures",
        "overview": "Legrand is a world leader in electrical and digital building infrastructures, headquartered in France with state-of-the-art manufacturing facilities in India. Renowned for safety, tactile ergonomics, and architectural elegance, Legrand products range from modular switches and sockets (Mylinc, Britzy, Arteor) to high-breaking-capacity DIN-rail MCBs and distribution boards (DX3).",
        "origin": "France (India operations: Mumbai)",
        "series": ["Mylinc Modular", "Arteor Luxury Series", "DX3 10kA Circuit Breakers", "Practibox S Enclosures"],
        "strengths": ["Virgin flame-retardant polycarbonate housing", "10,000A short circuit breaking capacity on MCBs", "Captive screw terminals with insulated safety barriers", "Tested for > 100,000 switching operations"],
        "is_indexable": True,
    },
    "philips": {
        "slug": "philips",
        "name": "Philips",
        "meta_title": "Philips LED Lighting & Battens | Vee Power Electricals Coimbatore",
        "meta_description": "Explore Philips EyeComfort LED bulbs, T5 tubelights, and recessed downlights. Energy-efficient, flicker-free illumination with genuine manufacturer warranty.",
        "tagline": "Signify - World Leader in Lighting",
        "overview": "Philips Lighting (now Signify) is the undisputed global benchmark for energy-efficient lighting. Featuring proprietary EyeComfort design parameters, Philips LED lamps and surface battens eliminate invisible stroboscopic flicker, reduce harmful blue light, and maintain steady lumen output for up to 25,000 hours. Vee Power Electricals distributes genuine Philips LED solutions for homes, showrooms, and commercial facilities.",
        "origin": "Netherlands (India operations: Gurugram)",
        "series": ["Stellar Bright LED Bulbs", "T5 Batten Tubelights", "Star Surface Downlights", "Deco Ring Panels"],
        "strengths": ["EyeComfort certified flicker-free technology", "High luminous efficacy (>100 lm/Watt)", "Integrated 2.5kV to 4kV surge suppression", "High Colour Rendering Index (CRI >80)"],
        "is_indexable": True,
    },
    "crompton": {
        "slug": "crompton",
        "name": "Crompton",
        "meta_title": "Crompton Fans & Home Electricals | Vee Power Electricals",
        "meta_description": "Buy Crompton high-speed ceiling fans, BLDC motors, and exhaust fans at Vee Power Electricals. Reliable performance and durable copper motors.",
        "tagline": "Let's Hangout Kool - 85+ Years of Engineering Heritage",
        "overview": "Crompton Greaves Consumer Electricals Limited has over 85 years of brand legacy in Indian electrical appliances. Known for high air delivery, silent operation, and long motor lifespan, Crompton ceiling and exhaust fans feature double ball bearings and dynamically balanced blades to withstand Indian tropical operating conditions.",
        "origin": "India (Mumbai, Maharashtra)",
        "series": ["Sea Breeze High Speed", "Energion BLDC", "Aura Decorative", "Brisk Air Exhaust"],
        "strengths": ["Double ball bearing motors for silent operation", "Dynamic balanced ribbed aluminum blades", "High air delivery up to 230 CMM", "Extensive national service center network"],
        "is_indexable": True,
    },
    "schneider": {
        "slug": "schneider",
        "name": "Schneider Electric",
        "meta_title": "Schneider Electric MCBs & Switchgear | Vee Power Electricals",
        "meta_description": "Buy genuine Schneider Electric miniature circuit breakers (MCBs), isolators, and modular switches. High-performance industrial and domestic safety.",
        "tagline": "Life Is On - Global Energy Management Specialist",
        "overview": "Schneider Electric is a global leader in energy management and electrical automation. Known for its Acti9 and EasyPact circuit protection ranges and AvatarOn modular switches, Schneider devices provide superior short-circuit response, bimetallic overload precision, and elegant aesthetics.",
        "origin": "France (India operations: Bengaluru)",
        "series": ["Acti9 MCBs", "Easy9 Protection", "AvatarOn Switches", "Resi9 Distribution Boards"],
        "strengths": ["VisiTrip technology for instant fault detection", "Bi-connect terminals for flexible wiring", "High breaking capacity up to 10kA", "EcoStruxure compatible components"],
        "is_indexable": True,
    },
    "anchor": {
        "slug": "anchor",
        "name": "Anchor",
        "meta_title": "Anchor by Panasonic Electricals | Vee Power Electricals",
        "meta_description": "Information on Anchor by Panasonic modular switches, Roma series, and wires. Inquire for project procurement and supply availability at Vee Power Electricals.",
        "tagline": "Anchor by Panasonic - Quality That Endures",
        "overview": "Anchor Electricals, acquired by Panasonic in 2007, is a household name in Indian wiring accessories.",
        "origin": "India (Panasonic Corporation, Japan)",
        "series": ["Roma Classic", "Roma Plus", "Rider Modular", "Advance Wires"],
        "strengths": ["Pioneer of modular switches in India", "Flame retardant polycarbonate construction"],
        "is_indexable": False,
    },
    "gloster": {
        "slug": "gloster",
        "name": "Gloster",
        "meta_title": "Gloster Cables | Industrial LT & HT Power Cables | Vee Power",
        "meta_description": "Overview of Gloster LT, HT, and specialty industrial cables. Contact Vee Power Electricals for heavy infrastructure and industrial cable inquiries.",
        "tagline": "Pioneers in Heavy Industrial & Underground Cables",
        "overview": "Gloster Cables Limited is an established Indian manufacturer specializing in high-voltage and low-voltage armored power cables.",
        "origin": "India (Kolkata, West Bengal)",
        "series": ["XLPE Armoured LT Power Cables", "HT 11kV/33kV Cables", "FS Fire Survival Cables"],
        "strengths": ["Heavy-duty steel wire/tape armoring", "CPRI and NABL certified test reports"],
        "is_indexable": False,
    },
    "jaquar": {
        "slug": "jaquar",
        "name": "Jaquar",
        "meta_title": "Jaquar Lighting | Architectural & Commercial LED | Vee Power",
        "meta_description": "Jaquar Lighting premium decorative fixtures, chandeliers, and outdoor architectural LEDs. Inquire for luxury residential and hospitality lighting projects.",
        "tagline": "Complete LED Lighting Solutions",
        "overview": "Jaquar Lighting, an extension of the prestigious Jaquar Group, provides complete commercial, decorative, and architectural LED lighting solutions.",
        "origin": "India (Manesar, Haryana)",
        "series": ["Vivid Architectural LED", "Decorative Chandeliers"],
        "strengths": ["High architectural aesthetics", "High CRI (>85) illumination"],
        "is_indexable": False,
    },
    "khaitan": {
        "slug": "khaitan",
        "name": "Khaitan",
        "meta_title": "Khaitan Fans & Home Appliances | Vee Power Electricals",
        "meta_description": "Khaitan heritage fans, heavy-duty industrial air circulators, and ventilation fans. Project procurement and wholesale inquiries at Vee Power Electricals.",
        "tagline": "The Name Is Enough - Heritage Fan Engineering",
        "overview": "Khaitan is a historic Indian brand synonymous with ceiling and industrial ventilation fans.",
        "origin": "India (Kolkata, West Bengal)",
        "series": ["Khaitan Magna", "Heavy Duty Industrial Exhaust"],
        "strengths": ["High air throw in tropical conditions", "Heavy-gauge motor stampings"],
        "is_indexable": False,
    },
}
BRAND_SEO_CONFIG["schneider-electric"] = {
    **BRAND_SEO_CONFIG["schneider"],
    "slug": "schneider-electric",
}


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

    # Only include brands that meet the indexing policy:
    # 1. Has active published products in inventory, OR
    # 2. Established brand with verified, rich content (is_indexable=True in BRAND_SEO_CONFIG)
    # Never include thin/empty brands with is_indexable=False
    active_brand_ids = set(products.values_list('brand_id', flat=True).distinct())
    eligible_brands = []
    for brand in Brand.objects.filter(is_active=True).order_by('name'):
        b_slug = (brand.slug or '').lower().strip()
        cfg = BRAND_SEO_CONFIG.get(b_slug)
        has_prods = brand.id in active_brand_ids
        is_indexable = cfg.get("is_indexable", False) if cfg else has_prods
        if is_indexable and (has_prods or (cfg and cfg.get("is_indexable"))):
            eligible_brands.append(brand)

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

    # 5. Eligible Brand Landing Pages
    for brand in eligible_brands:
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
    clean_slug = slug.lower().strip()
    brand_cfg = BRAND_SEO_CONFIG.get(clean_slug)

    # Database brand record lookup
    brand = Brand.objects.filter(slug=clean_slug).first()
    if not brand and brand_cfg:
        brand = Brand.objects.filter(name__iexact=brand_cfg["name"]).first()

    # Query active, indexable products for this brand
    products_qs = Product.objects.filter(active=True, is_indexable=True)
    if brand:
        brand_products = list(products_qs.filter(brand=brand).order_by('-updated_at')[:24])
    elif brand_cfg:
        brand_products = list(products_qs.filter(brand__name__iexact=brand_cfg["name"]).order_by('-updated_at')[:24])
    else:
        brand_products = []

    has_products = len(brand_products) > 0

    # If neither brand config nor database record exists, return 404
    if not brand and not brand_cfg:
        return _render_404_html(site_url, "Brand not found.")

    brand_name = brand_cfg["name"] if brand_cfg else (brand.name if brand else clean_slug.title())
    canonical = f"{site_url}/brands/{clean_slug}"
    title = brand_cfg["meta_title"] if brand_cfg else f"{brand_name} Electrical Products | Vee Power Electricals"
    description = brand_cfg["meta_description"] if brand_cfg else f"Explore {brand_name} electrical equipment, switchgear, and accessories at Vee Power Electricals."

    # Indexing policy:
    # Established brands with substantial, verified content (brand_cfg["is_indexable"])
    # OR brands that possess active, indexable catalog products are indexed.
    # Empty or thin brands without verified content or inventory remain noindex.
    is_indexable = False
    if brand_cfg:
        is_indexable = brand_cfg.get("is_indexable", False) or has_products
    else:
        is_indexable = has_products

    robots = "index, follow" if is_indexable else "noindex, follow"

    # Schema.org JSON-LD structured data
    schema_data = [
        {
            "@context": "https://schema.org",
            "@type": "Brand",
            "name": brand_name,
            "description": brand_cfg.get("overview", description) if brand_cfg else description,
            "url": canonical,
        },
        {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": "Home", "item": site_url},
                {"@type": "ListItem", "position": 2, "name": "Brands", "item": f"{site_url}/brands"},
                {"@type": "ListItem", "position": 3, "name": brand_name, "item": canonical},
            ]
        }
    ]

    if has_products:
        schema_data.append({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            "name": title,
            "description": description,
            "url": canonical,
            "mainEntity": {
                "@type": "ItemList",
                "itemListElement": [
                    {
                        "@type": "ListItem",
                        "position": idx + 1,
                        "name": p.name,
                        "url": f"{site_url}/product/{p.slug or p.id}",
                    }
                    for idx, p in enumerate(brand_products)
                ]
            }
        })

    # Render catalog items if available
    if brand_products:
        prod_items = "".join([
            f"<li style='margin-bottom:12px'>"
            f"<a href='{site_url}/product/{p.slug or p.id}' style='font-weight:600;color:#0284c7;text-decoration:none'>{html_escape(p.name)}</a>"
            f" &mdash; <strong>₹{p.price} INR</strong>"
            f" ({'In Stock' if p.stock > 0 else 'Temporarily Out of Stock'})"
            f"</li>"
            for p in brand_products
        ])
        products_section = f"""
        <section style="margin:30px 0">
          <h2>{html_escape(brand_name)} Available Product Catalog ({len(brand_products)})</h2>
          <ul style="padding-left:20px;line-height:1.8">{prod_items}</ul>
        </section>
        """
    else:
        products_section = f"""
        <section style="margin:30px 0;padding:20px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px">
          <h2>Direct Procurement &amp; Project Orders for {html_escape(brand_name)}</h2>
          <p>Online retail inventory for {html_escape(brand_name)} is currently allocated to on-site contractor orders. However, Vee Power Electricals procures and supplies complete {html_escape(brand_name)} project batches against customer BOQs across Tamil Nadu.</p>
          <p><a href="{site_url}/contact" style="display:inline-block;padding:10px 20px;background:#0284c7;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold">Request {html_escape(brand_name)} Quotation</a></p>
        </section>
        """

    strengths_html = ""
    if brand_cfg and brand_cfg.get("strengths"):
        str_items = "".join([f"<li>{html_escape(s)}</li>" for s in brand_cfg["strengths"]])
        strengths_html = f"<section style='margin:20px 0'><h3>Key Engineering Strengths</h3><ul>{str_items}</ul></section>"

    series_html = ""
    if brand_cfg and brand_cfg.get("series"):
        ser_items = "".join([f"<span style='display:inline-block;background:#f1f5f9;padding:4px 10px;border-radius:4px;margin:4px;font-size:13px'>{html_escape(s)}</span>" for s in brand_cfg["series"]])
        series_html = f"<section style='margin:20px 0'><h3>Popular Product Lines</h3><div>{ser_items}</div></section>"

    overview_text = brand_cfg.get("overview", description) if brand_cfg else description

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>{html_escape(title)}</title>
  <meta name="description" content="{html_escape(description)}">
  <link rel="canonical" href="{html_escape(canonical)}">
  <meta name="robots" content="{robots}">
  <meta property="og:title" content="{html_escape(title)}">
  <meta property="og:description" content="{html_escape(description)}">
  <meta property="og:url" content="{html_escape(canonical)}">
  <meta property="og:type" content="website">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{html_escape(title)}">
  <meta name="twitter:description" content="{html_escape(description)}">
  <script type="application/ld+json">{json.dumps(schema_data)}</script>
</head>
<body style="font-family:sans-serif;max-width:900px;margin:40px auto;padding:0 20px;line-height:1.6;color:#1e293b">
  <nav style="font-size:14px;margin-bottom:20px;color:#64748b">
    <a href="{site_url}/">Home</a> &gt; <a href="{site_url}/brands">Brands</a> &gt; <span>{html_escape(brand_name)}</span>
  </nav>
  <header>
    <h1 style="font-size:28px;margin-bottom:8px">{html_escape(brand_name)} Electricals</h1>
    <p style="font-size:16px;color:#0284c7;font-weight:600;margin-top:0">{html_escape(brand_cfg.get('tagline', 'Certified Manufacturer') if brand_cfg else 'Certified Manufacturer')}</p>
    <p style="font-size:15px;line-height:1.7">{html_escape(overview_text)}</p>
  </header>
  {strengths_html}
  {series_html}
  {products_section}
  <footer style="margin-top:40px;padding-top:20px;border-top:1px solid #e2e8f0;font-size:13px;color:#64748b">
    <p>Vee Power Electricals &mdash; Authorized Electrical Distributor in Coimbatore, Tamil Nadu. Fast dispatch across all 38 districts.</p>
  </footer>
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
