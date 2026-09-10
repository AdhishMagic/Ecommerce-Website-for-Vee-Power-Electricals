from django.core.management.base import BaseCommand
from apps.products.models import Category, Brand, Product

CATEGORIES = [
    {"id": "fans", "name": "Fans", "icon": "💨", "subcategories": ["Ceiling Fans", "Exhaust Fans", "Wall Mounted Fans", "Table Fans"]},
    {"id": "wires", "name": "Wires & Cables", "icon": "🔌", "subcategories": ["House Wires", "Power Cables", "Flexible Cables", "Armoured Cables"]},
    {"id": "switches", "name": "Switches", "icon": "🔘", "subcategories": ["Modular Switches", "Switch Plates", "Sockets", "Accessories"]},
    {"id": "lighting", "name": "LED & Lighting", "icon": "💡", "subcategories": ["LED Bulbs", "LED Panels", "Downlights", "Decorative Lighting"]},
    {"id": "mcb", "name": "MCB & Protection", "icon": "⚡", "subcategories": ["MCB", "RCCB", "Distribution Boards", "Protection Devices"]},
    {"id": "accessories", "name": "Electrical Accessories", "icon": "🔧", "subcategories": ["Conduits", "Junction Boxes", "Tape & Sealants", "Tools"]}
]

BRANDS = [
    "Havells", "Finolex", "Crompton", "Anchor", "Jaquar",
    "Khaitan", "Legrand", "Polycab", "Philips", "Gloster"
]

PRODUCTS = [
    {
        "sku": "HVL-CF-STL-1200",
        "name": "Havells Stealth 1200mm Ceiling Fan",
        "brand": "Havells",
        "category": "fans",
        "subcategory": "Ceiling Fans",
        "mrp": 3850,
        "price": 3199,
        "stock": 24,
        "low_stock_threshold": 5,
        "images": ["https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&h=600&fit=crop&auto=format"],
        "description": "Havells Stealth 1200mm ceiling fan with aerodynamic blades for superior air delivery. Energy efficient motor with 5-year warranty.",
        "specifications": {"Sweep Size": "1200 mm", "Power": "75 W", "Speed": "350 RPM", "Air Delivery": "210 CMM", "Voltage": "230 V", "Warranty": "2 Years"},
        "tags": ["ceiling fan", "energy efficient", "1200mm"],
        "featured": True,
        "active": True
    },
    {
        "sku": "CRM-CF-AURA-1200",
        "name": "Crompton Aura Prime 1200mm Ceiling Fan",
        "brand": "Crompton",
        "category": "fans",
        "subcategory": "Ceiling Fans",
        "mrp": 3400,
        "price": 2799,
        "stock": 18,
        "low_stock_threshold": 5,
        "images": ["https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&h=600&fit=crop&auto=format"],
        "description": "Crompton Aura Prime 1200mm decorative ceiling fan with anti-dust technology. 100% copper motor for high durability.",
        "specifications": {"Sweep Size": "1200 mm", "Power": "74 W", "Speed": "380 RPM", "Air Delivery": "230 CMM", "Warranty": "2 Years"},
        "tags": ["ceiling fan", "anti dust", "1200mm"],
        "featured": True,
        "active": True
    },
    {
        "sku": "FNX-W-1.5SQMM-90M",
        "name": "Finolex 1.5 sq mm Flame Retardant House Wire (90m)",
        "brand": "Finolex",
        "category": "wires",
        "subcategory": "House Wires",
        "mrp": 1950,
        "price": 1649,
        "stock": 50,
        "low_stock_threshold": 10,
        "images": ["https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600&h=600&fit=crop&auto=format"],
        "description": "Finolex 1.5 sq mm PVC insulated unsheathed industrial cables with flame retardant properties. 90-meter coil, red color.",
        "specifications": {"Conductor Material": "100% Bare Copper", "Voltage Rating": "1100 V", "Length": "90 meters", "Insulation": "PVC FR", "Color": "Red"},
        "tags": ["house wire", "finolex", "1.5 sq mm", "flame retardant"],
        "featured": True,
        "active": True
    },
    {
        "sku": "PLC-W-2.5SQMM-90M",
        "name": "Polycab Green 2.5 sq mm FR-LSH Wire (90m)",
        "brand": "Polycab",
        "category": "wires",
        "subcategory": "House Wires",
        "mrp": 3100,
        "price": 2599,
        "stock": 35,
        "low_stock_threshold": 8,
        "images": ["https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600&h=600&fit=crop&auto=format"],
        "description": "Polycab Green Wire 2.5 sq mm Flame Retardant Low Smoke & Halogen (FR-LSH) single core copper wire. High safety rating.",
        "specifications": {"Conductor": "Electrolytic Grade Copper", "Current Capacity": "22 A", "Length": "90 meters", "Color": "Blue"},
        "tags": ["polycab", "2.5 sq mm", "fr-lsh"],
        "featured": True,
        "active": True
    },
    {
        "sku": "LGR-SW-MOD-6A",
        "name": "Legrand Arteor 6A 1-Way Modular Switch",
        "brand": "Legrand",
        "category": "switches",
        "subcategory": "Modular Switches",
        "mrp": 95,
        "price": 75,
        "stock": 200,
        "low_stock_threshold": 30,
        "images": ["https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=600&h=600&fit=crop&auto=format"],
        "description": "Legrand Arteor 6A 1-Way Switch in Glossy White finish. Ultra-smooth mechanism with ISI marking.",
        "specifications": {"Current Rating": "6 A", "Voltage": "240 V", "Finish": "White Glossy", "Modules": "1 Module"},
        "tags": ["legrand", "modular switch", "6a"],
        "featured": False,
        "active": True
    },
    {
        "sku": "PHP-LED-9W-4PK",
        "name": "Philips Stellar Bright 9W Cool Day White LED Bulb (Pack of 4)",
        "brand": "Philips",
        "category": "lighting",
        "subcategory": "LED Bulbs",
        "mrp": 560,
        "price": 399,
        "stock": 80,
        "low_stock_threshold": 15,
        "images": ["https://images.unsplash.com/photo-1550985616-10810253b84d?w=600&h=600&fit=crop&auto=format"],
        "description": "Philips 9W B22 Cool Day White LED Bulb. EyeComfort technology for strain-free lighting. Saves up to 85% energy.",
        "specifications": {"Wattage": "9 W", "Lumens": "900 lm", "Color Temp": "6500 K (Cool Day White)", "Base": "B22", "Life": "15000 Hours"},
        "tags": ["philips", "led bulb", "9w"],
        "featured": True,
        "active": True
    }
]

class Command(BaseCommand):
    help = "Seed database with initial categories, brands, and products."

    def handle(self, *args, **options):
        self.stdout.write("Seeding categories...")
        for cat in CATEGORIES:
            Category.objects.get_or_create(
                slug=cat["id"],
                defaults={
                    "name": cat["name"],
                    "icon": cat["icon"],
                    "subcategories": cat["subcategories"]
                }
            )

        self.stdout.write("Seeding brands...")
        for brand in BRANDS:
            Brand.objects.get_or_create(
                slug=brand.lower(),
                defaults={"name": brand}
            )

        self.stdout.write("Seeding products...")
        for p in PRODUCTS:
            Product.objects.get_or_create(
                sku=p["sku"],
                defaults=p
            )

        self.stdout.write(self.style.SUCCESS("Database seeded successfully!"))
