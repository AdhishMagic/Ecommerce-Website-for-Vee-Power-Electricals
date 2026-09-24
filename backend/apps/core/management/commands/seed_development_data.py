import os
from datetime import date, datetime, timedelta
from decimal import Decimal
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.users.models import User, CustomerAddress, UserRole, AddressType
from apps.commercial_config.models import (
    TaxConfiguration,
    TaxMode,
    DeliveryConfiguration,
    DistanceSlab,
    ShippingRule,
    OrderDiscount,
    DiscountType,
    CompanyStoreConfiguration,
    RoundingMode,
)
from apps.products.models import (
    Category,
    Subcategory,
    Brand,
    Product,
    ProductImage,
    ProductSpecification,
)
from apps.inventory.models import StockTransaction, StockTransactionType
from apps.orders.models import (
    Order,
    OrderItem,
    OrderStatusHistory,
    OrderStatus,
    PaymentStatus as OrderPaymentStatus,
)
from apps.finance.models import (
    Client,
    Quotation,
    QuotationItem,
    QuotationStatus,
    Invoice,
    InvoiceItem,
    InvoiceStatus,
    PaymentTransaction,
    PaymentGateway,
    PaymentTxStatus,
    Expense,
    ExpenseCategory,
    ExpenseStatus,
    PayoutSettlement,
    SettlementStatus,
)
from apps.core.models import AdminConfigAuditLog, AuditActionType, ContactInquiry, InquiryStatus


class Command(BaseCommand):
    help = "Seed safe development baseline data across all 28 canonical entities (Idempotent)"

    @transaction.atomic
    def handle(self, *args, **options):
        self.stdout.write(self.style.NOTICE("Starting Vee Electricals development database seed..."))

        # -------------------------------------------------------------------------
        # 1. IDENTITY: Users
        # -------------------------------------------------------------------------
        super_admin_email = os.getenv("DJANGO_SUPERUSER_EMAIL", "admin@veepower.in")
        super_admin_password = os.getenv("DJANGO_SUPERUSER_PASSWORD", "AdminPass123!")

        super_admin, created = User.objects.get_or_create(
            email=super_admin_email,
            defaults={
                "username": super_admin_email,
                "first_name": "Vee",
                "last_name": "Admin",
                "phone": "+919876543210",
                "role": UserRole.ADMIN,
                "is_staff": True,
                "is_superuser": True,
                "is_active": True,
            },
        )
        if created:
            super_admin.set_password(super_admin_password)
            super_admin.save()
            self.stdout.write(f"  + Created Super Admin: {super_admin.email}")
        else:
            self.stdout.write(f"  = Super Admin already exists: {super_admin.email}")

        sales_staff, created = User.objects.get_or_create(
            email="sales@veepower.in",
            defaults={
                "username": "sales@veepower.in",
                "first_name": "Suresh",
                "last_name": "Staff",
                "phone": "+919876543211",
                "role": UserRole.ADMIN,
                "is_staff": True,
                "is_superuser": False,
                "is_active": True,
            },
        )
        if created:
            sales_staff.set_password("SalesPass123!")
            sales_staff.save()
            self.stdout.write(f"  + Created Sales Staff: {sales_staff.email}")

        customer_user, created = User.objects.get_or_create(
            email="rajesh.kumar@example.com",
            defaults={
                "username": "rajesh.kumar@example.com",
                "first_name": "Rajesh",
                "last_name": "Kumar",
                "phone": "+919842100001",
                "role": UserRole.CUSTOMER,
                "is_staff": False,
                "is_superuser": False,
                "is_active": True,
            },
        )
        if created:
            customer_user.set_password("CustomerPass123!")
            customer_user.save()
            self.stdout.write(f"  + Created Retail Customer: {customer_user.email}")

        # -------------------------------------------------------------------------
        # 2. IDENTITY: CustomerAddress
        # -------------------------------------------------------------------------
        customer_addr, created = CustomerAddress.objects.get_or_create(
            user=customer_user,
            address_line1="14/B, Trichy Road, Singanallur",
            city="Coimbatore",
            defaults={
                "recipient_name": "Rajesh Kumar",
                "phone": "+919842100001",
                "landmark": "Near Bus Stand",
                "state": "Tamil Nadu",
                "pincode": "641005",
                "address_type": AddressType.HOME,
                "is_default": True,
            },
        )
        if created:
            self.stdout.write(f"  + Created default CustomerAddress for {customer_user.email}")

        # -------------------------------------------------------------------------
        # 3. CONFIGURATION: CompanyStoreConfiguration (Singleton id=1)
        # -------------------------------------------------------------------------
        store_config, created = CompanyStoreConfiguration.objects.get_or_create(
            id=1,
            defaults={
                "legal_company_name": "Vee Power Electricals",
                "brand_name": "Vee Power Electricals",
                "gstin": "33AABFV1234A1ZX",
                "pan": "AABFV1234A",
                "registered_address": "No 28/1, 2nd floor, MTP Road, Muthu nagar, NSN palayam, Coimbatore - 641031",
                "warehouse_address": "No 28/1, 2nd floor, MTP Road, Muthu nagar, NSN palayam, Coimbatore - 641031",
                "support_email": "support@veepower.in",
                "support_phone": "+91 98765 43210",
                "bank_name": "State Bank of India",
                "bank_account_number": "38492019482",
                "bank_ifsc": "SBIN0001234",
                "bank_branch": "Coimbatore Main Branch",
                "currency_code": "INR",
                "currency_symbol": "₹",
                "rounding_mode": RoundingMode.ROUND_HALF_UP,
                "auto_cancel_unpaid_minutes": 30,
                "cancellation_allowed_until": "CONFIRMED",
                "return_window_days": 7,
                "require_shipping_awb": True,
                "upi_enabled": True,
                "cards_enabled": True,
                "netbanking_enabled": True,
                "cod_enabled": True,
                "cod_max_limit": Decimal("10000.00"),
                "guest_checkout_enabled": False,
                "is_maintenance_mode": False,
                "maintenance_notice": None,
            },
        )
        if created:
            self.stdout.write("  + Created CompanyStoreConfiguration (singleton)")

        # -------------------------------------------------------------------------
        # 4. CONFIGURATION: TaxConfiguration
        # -------------------------------------------------------------------------
        tax_config, created = TaxConfiguration.objects.get_or_create(
            tax_name="Indian Standard GST (Electrical Goods)",
            business_state="Tamil Nadu",
            version_number=1,
            defaults={
                "default_tax_rate": Decimal("18.00"),
                "cgst_rate": Decimal("9.00"),
                "sgst_rate": Decimal("9.00"),
                "igst_rate": Decimal("18.00"),
                "tax_calculation_mode": TaxMode.TAX_EXCLUSIVE,
                "effective_from": timezone.make_aware(datetime(2026, 1, 1, 0, 0, 0)),
                "is_active": True,
                "created_by": super_admin,
            },
        )
        if created:
            self.stdout.write(f"  + Created TaxConfiguration: {tax_config.tax_name}")

        # -------------------------------------------------------------------------
        # 5. CONFIGURATION: DeliveryConfiguration & DistanceSlabs
        # -------------------------------------------------------------------------
        delivery_config, created = DeliveryConfiguration.objects.get_or_create(
            origin_name="Vee Power Coimbatore Hub",
            version_number=1,
            defaults={
                "origin_address": "No 28/1, 2nd floor, MTP Road, NSN palayam",
                "origin_city": "Coimbatore",
                "origin_state": "Tamil Nadu",
                "origin_pincode": "641031",
                "latitude": Decimal("11.084800"),
                "longitude": Decimal("76.941600"),
                "base_delivery_charge": Decimal("100.00"),
                "distance_slab_km": Decimal("10.00"),
                "charge_per_slab": Decimal("100.00"),
                "free_delivery_threshold": Decimal("999.00"),
                "fallback_regional_rate": Decimal("100.00"),
                "free_delivery_enabled": True,
                "effective_from": timezone.make_aware(datetime(2026, 1, 1, 0, 0, 0)),
                "is_active": True,
                "created_by": super_admin,
            },
        )
        if created:
            self.stdout.write(f"  + Created DeliveryConfiguration: {delivery_config.origin_name}")

        slabs_data = [
            (Decimal("0.00"), Decimal("10.00"), Decimal("100.00"), 1),
            (Decimal("10.00"), Decimal("20.00"), Decimal("200.00"), 2),
            (Decimal("20.00"), Decimal("30.00"), Decimal("300.00"), 3),
            (Decimal("30.00"), Decimal("40.00"), Decimal("400.00"), 4),
            (Decimal("40.00"), Decimal("50.00"), Decimal("500.00"), 5),
        ]
        for min_km, max_km, rate, sort_order in slabs_data:
            DistanceSlab.objects.get_or_create(
                delivery_config=delivery_config,
                min_distance_km=min_km,
                max_distance_km=max_km,
                defaults={
                    "rate": rate,
                    "sort_order": sort_order,
                    "is_active": True,
                },
            )

        # -------------------------------------------------------------------------
        # 6. CONFIGURATION: ShippingRules
        # -------------------------------------------------------------------------
        rules_data = [
            ("Tamil Nadu", Decimal("50.00"), 1, 3),
            ("Karnataka", Decimal("80.00"), 2, 4),
            ("Kerala", Decimal("80.00"), 2, 4),
            ("Andhra Pradesh", Decimal("90.00"), 2, 5),
            ("Maharashtra", Decimal("100.00"), 3, 5),
            ("Delhi", Decimal("150.00"), 4, 7),
        ]
        for state, cost, min_d, max_d in rules_data:
            ShippingRule.objects.get_or_create(
                state=state,
                defaults={
                    "cost": cost,
                    "estimated_days_min": min_d,
                    "estimated_days_max": max_d,
                    "is_active": True,
                },
            )

        # -------------------------------------------------------------------------
        # 7. CONFIGURATION: OrderDiscounts
        # -------------------------------------------------------------------------
        OrderDiscount.objects.get_or_create(
            code="WELCOME10",
            defaults={
                "description": "10% off for new customers",
                "discount_type": DiscountType.PERCENTAGE,
                "discount_value": Decimal("10.00"),
                "min_order_value": Decimal("1000.00"),
                "max_discount_cap": Decimal("500.00"),
                "usage_limit_total": 1000,
                "usage_limit_per_user": 1,
                "allow_stacking": False,
                "valid_from": timezone.make_aware(datetime(2026, 1, 1, 0, 0, 0)),
                "is_active": True,
                "created_by": super_admin,
            },
        )
        OrderDiscount.objects.get_or_create(
            code="VEE500",
            defaults={
                "description": "Flat ₹500 off on bulk orders above ₹5000",
                "discount_type": DiscountType.FIXED,
                "discount_value": Decimal("500.00"),
                "min_order_value": Decimal("5000.00"),
                "max_discount_cap": None,
                "usage_limit_total": 500,
                "usage_limit_per_user": 2,
                "allow_stacking": False,
                "valid_from": timezone.make_aware(datetime(2026, 1, 1, 0, 0, 0)),
                "is_active": True,
                "created_by": super_admin,
            },
        )

        # -------------------------------------------------------------------------
        # 8. CATALOG: Brands
        # -------------------------------------------------------------------------
        brands_data = [
            ("Havells", "havells", "Leading manufacturer of electrical and power distribution equipment"),
            ("Polycab", "polycab", "India's largest wire and cable manufacturer"),
            ("Finolex", "finolex", "Premium quality electrical wires and cables"),
            ("Philips", "philips", "Global leader in professional and consumer LED lighting"),
            ("Legrand", "legrand", "Global specialist in electrical and digital building infrastructures"),
            ("Schneider Electric", "schneider-electric", "Leader in digital transformation of energy management"),
            ("Anchor", "anchor", "Trusted modular switches and domestic electrical accessories"),
            ("Crompton", "crompton", "Consumer electricals including premium fans and pumps"),
        ]
        brand_objs = {}
        for name, slug, desc in brands_data:
            b, _ = Brand.objects.get_or_create(slug=slug, defaults={"name": name, "description": desc, "is_active": True})
            brand_objs[slug] = b

        # -------------------------------------------------------------------------
        # 9. CATALOG: Categories & Subcategories
        # -------------------------------------------------------------------------
        cats_data = [
            ("Fans", "fans", "Ceiling, exhaust, wall and industrial fans", [
                ("Ceiling Fans", "ceiling-fans"),
                ("Exhaust Fans", "exhaust-fans"),
                ("Wall Fans", "wall-fans"),
            ]),
            ("Wires & Cables", "wires-cables", "Copper building wires, submersible cables, industrial flex", [
                ("Single Core Wire", "single-core-wire"),
                ("Multi Strand Cable", "multi-strand-cable"),
                ("Submersible Cable", "submersible-cable"),
            ]),
            ("Modular Switches", "modular-switches", "Designer switch plates, sockets, and regulators", [
                ("Switch Plates", "switch-plates"),
                ("Power Sockets", "power-sockets"),
                ("Fan Regulators", "fan-regulators"),
            ]),
            ("LED Lighting", "led-lighting", "Energy efficient LED batten, downlights, and panels", [
                ("LED Battens", "led-battens"),
                ("Downlights", "downlights"),
                ("Flood Lights", "flood-lights"),
            ]),
            ("MCB & Distribution", "mcb-distribution", "Circuit breakers, isolators, and distribution boards", [
                ("SP MCB", "sp-mcb"),
                ("DP Isolator", "dp-isolator"),
                ("Distribution Boards", "distribution-boards"),
            ]),
        ]
        cat_objs = {}
        subcat_objs = {}
        for cat_name, cat_slug, cat_desc, subcats in cats_data:
            c, _ = Category.objects.get_or_create(
                slug=cat_slug, defaults={"name": cat_name, "is_active": True}
            )
            cat_objs[cat_slug] = c
            for sub_name, sub_slug in subcats:
                sc, _ = Subcategory.objects.get_or_create(
                    category=c, slug=sub_slug, defaults={"name": sub_name, "is_active": True}
                )
                subcat_objs[sub_slug] = sc

        # -------------------------------------------------------------------------
        # 10. CATALOG: Products, ProductImages, ProductSpecifications
        # -------------------------------------------------------------------------
        products_data = [
            {
                "sku": "FAN-HAV-001",
                "name": "Havells Stealth Air 1200mm Ceiling Fan",
                "slug": "havells-stealth-air-1200mm-ceiling-fan",
                "category": cat_objs["fans"],
                "subcategory": subcat_objs["ceiling-fans"],
                "brand": brand_objs["havells"],
                "mrp": Decimal("4990.00"),
                "price": Decimal("3899.00"),
                "stock": 50,
                "low_stock_threshold": 10,
                "featured": True,
                "description": "Aerodynamic blades with silent BLDC technology for superior air delivery and energy savings.",
                "primary_image": "https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=800&q=80",
                "specs": [
                    ("Sweep Size", "1200 mm", 1),
                    ("Power Consumption", "28 W", 2),
                    ("Speed", "380 RPM", 3),
                ],
            },
            {
                "sku": "WIR-POL-001",
                "name": "Polycab 2.5 Sq mm Flame Retardant Wire (90m)",
                "slug": "polycab-2-5-sq-mm-flame-retardant-wire-90m",
                "category": cat_objs["wires-cables"],
                "subcategory": subcat_objs["single-core-wire"],
                "brand": brand_objs["polycab"],
                "mrp": Decimal("2850.00"),
                "price": Decimal("2250.00"),
                "stock": 100,
                "low_stock_threshold": 20,
                "featured": True,
                "description": "100% electrolytic grade copper conductors with high oxygen and temperature index for fire safety.",
                "primary_image": "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=800&q=80",
                "specs": [
                    ("Conductor Material", "Electrolytic Copper", 1),
                    ("Cross Section", "2.5 sq mm", 2),
                    ("Standard Length", "90 meters", 3),
                ],
            },
            {
                "sku": "SWI-LEG-001",
                "name": "Legrand Arteor 10A 1-Way Modular Switch",
                "slug": "legrand-arteor-10a-1-way-modular-switch",
                "category": cat_objs["modular-switches"],
                "subcategory": subcat_objs["switch-plates"],
                "brand": brand_objs["legrand"],
                "mrp": Decimal("180.00"),
                "price": Decimal("135.00"),
                "stock": 250,
                "low_stock_threshold": 30,
                "featured": False,
                "description": "Sleek European minimalist styling with silver-inlaid contacts for over 100,000 operations.",
                "primary_image": "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=800&q=80",
                "specs": [
                    ("Rated Current", "10 Amps", 1),
                    ("Module Size", "1 Module", 2),
                ],
            },
            {
                "sku": "LED-PHI-001",
                "name": "Philips Stellar 20W T5 LED Batten",
                "slug": "philips-stellar-20w-t5-led-batten",
                "category": cat_objs["led-lighting"],
                "subcategory": subcat_objs["led-battens"],
                "brand": brand_objs["philips"],
                "mrp": Decimal("520.00"),
                "price": Decimal("399.00"),
                "stock": 80,
                "low_stock_threshold": 15,
                "featured": True,
                "description": "Glase-free uniform diffuse lighting with surge protection up to 4kV.",
                "primary_image": "https://images.unsplash.com/photo-1565814636199-ae8133055c1c?auto=format&fit=crop&w=800&q=80",
                "specs": [
                    ("Wattage", "20 Watts", 1),
                    ("Color Temp", "6500K Cool Day White", 2),
                    ("Lumen Output", "2000 lm", 3),
                ],
            },
            {
                "sku": "MCB-SCH-001",
                "name": "Schneider Acti9 32A C-Curve SP MCB",
                "slug": "schneider-acti9-32a-c-curve-sp-mcb",
                "category": cat_objs["mcb-distribution"],
                "subcategory": subcat_objs["sp-mcb"],
                "brand": brand_objs["schneider-electric"],
                "mrp": Decimal("460.00"),
                "price": Decimal("340.00"),
                "stock": 60,
                "low_stock_threshold": 10,
                "featured": False,
                "description": "Short circuit protection rated up to 10kA breaking capacity with VisiTrip indicator.",
                "primary_image": "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=800&q=80",
                "specs": [
                    ("Breaking Capacity", "10 kA", 1),
                    ("Poles", "Single Pole (SP)", 2),
                    ("Trip Curve", "C Curve", 3),
                ],
            },
        ]

        seeded_products = []
        for pdata in products_data:
            p, created = Product.objects.get_or_create(
                sku=pdata["sku"],
                defaults={
                    "name": pdata["name"],
                    "slug": pdata["slug"],
                    "category": pdata["category"],
                    "subcategory": pdata["subcategory"],
                    "brand": pdata["brand"],
                    "mrp": pdata["mrp"],
                    "price": pdata["price"],
                    "stock": pdata["stock"],
                    "low_stock_threshold": pdata["low_stock_threshold"],
                    "description": pdata["description"],
                    "primary_image": pdata["primary_image"],
                    "featured": pdata["featured"],
                    "active": True,
                },
            )
            seeded_products.append(p)

            # ProductImage
            ProductImage.objects.get_or_create(
                product=p,
                image_url=pdata["primary_image"],
                defaults={"sort_order": 1, "is_primary": True},
            )

            # ProductSpecification
            for spec_key, spec_val, sort_ord in pdata["specs"]:
                ProductSpecification.objects.get_or_create(
                    product=p,
                    spec_key=spec_key,
                    defaults={
                        "spec_value": spec_val,
                        "sort_order": sort_ord,
                    },
                )

        self.stdout.write(f"  + Seeded {len(seeded_products)} catalog products with images and specifications")

        # -------------------------------------------------------------------------
        # 11. INVENTORY: StockTransaction
        # -------------------------------------------------------------------------
        for p in seeded_products:
            StockTransaction.objects.get_or_create(
                product=p,
                transaction_type=StockTransactionType.RESTOCK,
                defaults={
                    "change_amount": p.stock,
                    "notes": f"Initial baseline restock for {p.name}",
                    "performed_by": super_admin,
                },
            )
        self.stdout.write("  + Seeded initial StockTransactions for catalog products")

        # -------------------------------------------------------------------------
        # 12. ORDERS: Order, OrderItem, OrderStatusHistory
        # -------------------------------------------------------------------------
        sample_prod = seeded_products[0]
        order_num = "ORD-2026-0001"
        order, created = Order.objects.get_or_create(
            order_number=order_num,
            defaults={
                "user": customer_user,
                "customer_name": "Rajesh Kumar",
                "customer_email": "rajesh.kumar@example.com",
                "customer_phone": "+919842100001",
                "shipping_address": {
                    "recipient_name": "Rajesh Kumar",
                    "address_line1": "14/B, Trichy Road, Singanallur",
                    "city": "Coimbatore",
                    "state": "Tamil Nadu",
                    "pincode": "641005",
                    "phone": "+919842100001",
                },
                "billing_address": None,
                "is_business_order": False,
                "subtotal": sample_prod.price * 2,
                "product_discount": Decimal("0.00"),
                "order_discount": Decimal("0.00"),
                "total_discount": Decimal("0.00"),
                "taxable_amount": sample_prod.price * 2,
                "tax_amount": (sample_prod.price * 2 * Decimal("0.18")),
                "cgst_amount": (sample_prod.price * 2 * Decimal("0.09")),
                "sgst_amount": (sample_prod.price * 2 * Decimal("0.09")),
                "igst_amount": Decimal("0.00"),
                "shipping_fee": Decimal("0.00"),
                "shipping_discount": Decimal("0.00"),
                "total_amount": (sample_prod.price * 2 * Decimal("1.18")),
                "status": OrderStatus.CONFIRMED,
                "payment_status": OrderPaymentStatus.PAID,
                "payment_method": "UPI",
                "tracking_number": "TRK-2026-COIM-001",
                "notes": "Please deliver before 6 PM",
                "calculation_snapshot": {
                    "tax_mode": "TAX_EXCLUSIVE",
                    "tax_rate": 18.0,
                    "applied_shipping_rule": "Tamil Nadu",
                },
            },
        )
        if created:
            OrderItem.objects.create(
                order=order,
                product=sample_prod,
                product_name=sample_prod.name,
                sku=sample_prod.sku,
                image_url=sample_prod.primary_image,
                mrp=sample_prod.mrp,
                unit_price=sample_prod.price,
                quantity=2,
                line_discount=Decimal("0.00"),
                taxable_amount=sample_prod.price * 2,
                tax_rate=Decimal("18.00"),
                tax_amount=sample_prod.price * 2 * Decimal("0.18"),
                subtotal=sample_prod.price * 2,
                total_amount=sample_prod.price * 2 * Decimal("1.18"),
            )
            OrderStatusHistory.objects.create(
                order=order,
                previous_status=OrderStatus.PENDING,
                new_status=OrderStatus.CONFIRMED,
                changed_by=sales_staff,
                reason="Order confirmed upon full payment receipt",
            )
            self.stdout.write(f"  + Created Order: {order.order_number}")

        # -------------------------------------------------------------------------
        # 13. FINANCE: Clients
        # -------------------------------------------------------------------------
        clients_data = [
            ("CLI-LT-001", "L&T Construction", "Arun Varma", "arun.varma@larsentoubro.com", "+919811223344", "33AAACL1234F1Z1", "Chennai"),
            ("CLI-RR-002", "Reliance Retail", "Pooja Mehta", "pooja.mehta@ril.com", "+919822334455", "33AAACR2345G1Z2", "Coimbatore"),
            ("CLI-TP-003", "Tata Projects", "Karthik Raja", "karthik.raja@tataprojects.com", "+919833445566", "33AAACT3456H1Z3", "Bengaluru"),
            ("CLI-SP-004", "Shapoorji Pallonji", "Vikram Sen", "vikram.sen@shapoorji.com", "+919844556677", "33AAACS4567J1Z4", "Kochi"),
            ("CLI-GP-005", "Godrej Properties", "Deepak Iyer", "deepak.iyer@godrejproperties.com", "+919855667788", "33AAACG5678K1Z5", "Coimbatore"),
        ]
        client_objs = []
        for code, name, contact, email, phone, gstin, city in clients_data:
            c, _ = Client.objects.get_or_create(
                client_code=code,
                defaults={
                    "company_name": name,
                    "contact_person": contact,
                    "gstin": gstin,
                    "email": email,
                    "phone": phone,
                    "credit_limit": Decimal("500000.00"),
                    "address": f"Industrial Park, {city}",
                    "is_active": True,
                },
            )
            client_objs.append(c)
        self.stdout.write(f"  + Seeded {len(client_objs)} B2B Corporate Clients")

        # -------------------------------------------------------------------------
        # 14. FINANCE: Quotation & QuotationItem
        # -------------------------------------------------------------------------
        primary_client = client_objs[0]
        quotation, created = Quotation.objects.get_or_create(
            quotation_number="QUO-2026-0001",
            defaults={
                "client": primary_client,
                "quotation_date": date.today(),
                "expiry_date": date.today() + timedelta(days=30),
                "total_value": Decimal("45000.00"),
                "status": QuotationStatus.SENT,
                "notes": "Commercial building wiring quotation with volume discounts.",
                "created_by": sales_staff,
            },
        )
        if created:
            QuotationItem.objects.create(
                quotation=quotation,
                product=seeded_products[1],  # Wire
                item_name="Polycab 2.5 Sq mm Flame Retardant Wire (90m) - 20 Coils",
                quantity=20,
                unit_price=Decimal("2250.00"),
                subtotal=Decimal("45000.00"),
            )
            self.stdout.write(f"  + Created Quotation: {quotation.quotation_number}")

        # -------------------------------------------------------------------------
        # 15. FINANCE: Invoice & InvoiceItem
        # -------------------------------------------------------------------------
        invoice, created = Invoice.objects.get_or_create(
            invoice_number="INV-2026-0001",
            defaults={
                "client": primary_client,
                "order": None,
                "quotation": quotation,
                "invoice_date": date.today(),
                "due_date": date.today() + timedelta(days=15),
                "subtotal": Decimal("45000.00"),
                "discount_amount": Decimal("0.00"),
                "taxable_amount": Decimal("45000.00"),
                "cgst_amount": Decimal("4050.00"),
                "sgst_amount": Decimal("4050.00"),
                "igst_amount": Decimal("0.00"),
                "tax_amount": Decimal("8100.00"),
                "shipping_fee": Decimal("0.00"),
                "total_amount": Decimal("53100.00"),
                "status": InvoiceStatus.UNPAID,
                "payment_status": "Pending",
                "notes": "Net 15 commercial invoice.",
                "calculation_snapshot": {
                    "cgst_rate": 9.0,
                    "sgst_rate": 9.0,
                    "tax_mode": "TAX_EXCLUSIVE",
                },
            },
        )
        if created:
            InvoiceItem.objects.create(
                invoice=invoice,
                product=seeded_products[1],
                item_name="Polycab 2.5 Sq mm Flame Retardant Wire (90m) - 20 Coils",
                sku=seeded_products[1].sku,
                quantity=20,
                rate=Decimal("2250.00"),
                taxable_amount=Decimal("45000.00"),
                tax_percent=Decimal("18.00"),
                cgst_amount=Decimal("4050.00"),
                sgst_amount=Decimal("4050.00"),
                igst_amount=Decimal("0.00"),
                tax_amount=Decimal("8100.00"),
                total_amount=Decimal("53100.00"),
            )
            self.stdout.write(f"  + Created Invoice: {invoice.invoice_number}")

        # -------------------------------------------------------------------------
        # 16. FINANCE: PaymentTransaction
        # -------------------------------------------------------------------------
        PaymentTransaction.objects.get_or_create(
            gateway_transaction_id="pay_test_0001928374",
            defaults={
                "order": order,
                "invoice": None,
                "gateway": PaymentGateway.RAZORPAY,
                "amount": order.total_amount,
                "currency": "INR",
                "payment_method": "UPI",
                "status": PaymentTxStatus.SUCCESS,
                "metadata": {"status": "authorized", "method": "upi", "vpa": "rajesh@okhdfcbank"},
            },
        )

        # -------------------------------------------------------------------------
        # 17. FINANCE: Expense & PayoutSettlement
        # -------------------------------------------------------------------------
        Expense.objects.get_or_create(
            description="Warehouse Electricity Bill - Coimbatore Hub",
            expense_date=date.today() - timedelta(days=5),
            defaults={
                "category": ExpenseCategory.UTILITIES,
                "vendor": "TNEB Coimbatore",
                "amount": Decimal("8450.00"),
                "status": ExpenseStatus.PAID,
                "payment_mode": "Bank Transfer",
                "created_by": sales_staff,
            },
        )

        PayoutSettlement.objects.get_or_create(
            settlement_id="SETTL-2026-0001",
            defaults={
                "gateway": "RAZORPAY",
                "settlement_date": date.today() - timedelta(days=2),
                "gross_amount": Decimal("15450.00"),
                "gateway_fee": Decimal("309.00"),
                "tax_on_fee": Decimal("55.62"),
                "net_amount": Decimal("15085.38"),
                "status": SettlementStatus.SETTLED,
                "bank_reference": "UTR1239847192847",
                "notes": "Daily automated payment batch settlement into SBI Current Account.",
            },
        )

        # -------------------------------------------------------------------------
        # 18. GOVERNANCE / COMMUNICATION: AdminConfigAuditLog & ContactInquiry
        # -------------------------------------------------------------------------
        AdminConfigAuditLog.objects.get_or_create(
            domain="TAX_CONFIGURATION",
            record_id=tax_config.id,
            action_type=AuditActionType.CREATE,
            defaults={
                "admin_user": super_admin,
                "old_value": None,
                "new_value": {"tax_name": tax_config.tax_name, "rate": "18.00"},
                "change_reason": "Initial setup of canonical statutory GST tax baseline.",
                "ip_address": "127.0.0.1",
            },
        )

        ContactInquiry.objects.get_or_create(
            email="contractor.chennai@example.com",
            subject="Bulk Enquiry for Commercial Project in Coimbatore",
            defaults={
                "name": "M. Senthil Nathan",
                "phone": "+919443219876",
                "message": "We need 50 coils of Polycab 4 sq mm and 20 distribution boards. Kindly quote best wholesale rate.",
                "status": InquiryStatus.NEW,
            },
        )

        self.stdout.write(self.style.SUCCESS("Vee Electricals Phase 3 development seed completed successfully!"))
