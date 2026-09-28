from decimal import Decimal, ROUND_HALF_UP
from datetime import timedelta
import threading
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.users.models import UserRole
from apps.core.models import AdminConfigAuditLog, AuditActionType
from apps.commercial_config.models import (
    CompanyStoreConfiguration,
    TaxConfiguration,
    TaxMode,
    DeliveryConfiguration,
    DistanceSlab,
    ShippingRule,
    OrderDiscount,
    DiscountType,
)
from apps.commercial_config.services import (
    TaxService,
    DeliveryService,
    DiscountService,
    BillingService,
)
from apps.commercial_config.services.audit_service import log_admin_config_change, sanitize_audit_payload
from apps.products.models import Product, Category, Brand
from apps.orders.models import Order, OrderItem, OrderStatus, PaymentStatus
from apps.finance.models import Invoice, InvoiceItem, Client, Quotation, QuotationItem

User = get_user_model()


class Step11ConfigurationTestCase(TestCase):
    """
    Step 11 — Configuration Finalization Comprehensive Test Suite.
    Validates company profile, versioned effective-dated taxes, logistics slabs,
    promotional discounts, 50% cap, audit logging, historical transaction isolation,
    API RBAC security, and query efficiency.
    """

    def setUp(self):
        self.client = APIClient()

        # Users
        self.admin = User.objects.create_user(
            email='admin_cfg@veepower.com',
            password='AdminPassword123!',
            first_name='Admin',
            last_name='User',
            role=UserRole.ADMIN,
            is_staff=True,
        )
        self.customer = User.objects.create_user(
            email='cust_cfg@example.com',
            password='CustomerPassword123!',
            first_name='Retail',
            last_name='Customer',
            role=UserRole.CUSTOMER,
        )

        # Baseline Category, Brand, Product
        self.category = Category.objects.create(name='Heavy Switchgear', slug='heavy-switchgear')
        self.brand = Brand.objects.create(name='Vee Power Heavy', slug='vee-power-heavy')
        self.product = Product.objects.create(
            name='Industrial Motor Starter 45KW',
            slug='industrial-motor-starter-45kw',
            sku='IMS-45KW-PROD',
            category=self.category,
            brand=self.brand,
            mrp=Decimal('5000.00'),
            price=Decimal('4000.00'),
            stock=50,
            active=True,
        )

        # Baseline Store Config
        self.store_config, _ = CompanyStoreConfiguration.objects.get_or_create(
            id=1,
            defaults={
                'legal_company_name': 'Vee Power Electricals Private Limited',
                'brand_name': 'Vee Power Electricals',
                'gstin': '33AABFV1234A1ZX',
                'pan': 'AABFV1234A',
                'registered_address': 'No 28/1, MTP Road, Coimbatore - 641031',
                'warehouse_address': 'No 28/1, MTP Road, Coimbatore - 641031',
                'support_email': 'support@veepower.in',
                'support_phone': '+91 98765 43210',
                'currency_code': 'INR',
                'currency_symbol': '₹',
            }
        )

        # Baseline Tax Config (Current Active)
        self.tax_config = TaxConfiguration.objects.create(
            tax_name='Standard Indian GST',
            default_tax_rate=Decimal('18.00'),
            cgst_rate=Decimal('9.00'),
            sgst_rate=Decimal('9.00'),
            igst_rate=Decimal('18.00'),
            tax_calculation_mode=TaxMode.TAX_EXCLUSIVE,
            business_state='Tamil Nadu',
            effective_from=timezone.now() - timedelta(days=30),
            effective_until=timezone.now() + timedelta(days=365),
            version_number=1,
            is_active=True,
            created_by=self.admin,
        )

        # Baseline Delivery Config
        self.delivery_config = DeliveryConfiguration.objects.create(
            origin_name='Coimbatore Central Logistics Hub',
            origin_city='Coimbatore',
            origin_state='Tamil Nadu',
            origin_pincode='641031',
            base_delivery_charge=Decimal('100.00'),
            distance_slab_km=Decimal('10.00'),
            charge_per_slab=Decimal('50.00'),
            free_delivery_threshold=Decimal('2000.00'),
            fallback_regional_rate=Decimal('150.00'),
            free_delivery_enabled=True,
            version_number=1,
            is_active=True,
            created_by=self.admin,
        )

        # Discrete Continuous Distance Slabs: [0, 10), [10, 20), [20, 30)
        self.slab1 = DistanceSlab.objects.create(
            delivery_config=self.delivery_config,
            min_distance_km=Decimal('0.00'),
            max_distance_km=Decimal('10.00'),
            rate=Decimal('40.00'),
            sort_order=1,
            is_active=True,
        )
        self.slab2 = DistanceSlab.objects.create(
            delivery_config=self.delivery_config,
            min_distance_km=Decimal('10.00'),
            max_distance_km=Decimal('20.00'),
            rate=Decimal('80.00'),
            sort_order=2,
            is_active=True,
        )
        self.slab3 = DistanceSlab.objects.create(
            delivery_config=self.delivery_config,
            min_distance_km=Decimal('20.00'),
            max_distance_km=Decimal('30.00'),
            rate=Decimal('120.00'),
            sort_order=3,
            is_active=True,
        )

        # Shipping Rule Fallback
        self.shipping_rule_ka = ShippingRule.objects.create(
            state='Karnataka',
            cost=Decimal('180.00'),
            estimated_days_min=3,
            estimated_days_max=5,
            is_active=True,
        )

        # Coupons
        self.coupon_pct = OrderDiscount.objects.create(
            code='SAVE20',
            description='20% off orders over 1000',
            discount_type=DiscountType.PERCENTAGE,
            discount_value=Decimal('20.00'),
            min_order_value=Decimal('1000.00'),
            max_discount_cap=Decimal('500.00'),
            valid_from=timezone.now() - timedelta(days=5),
            valid_until=timezone.now() + timedelta(days=30),
            is_active=True,
        )

    # -------------------------------------------------------------
    # 1. Company Configuration CRUD
    # -------------------------------------------------------------
    def test_company_configuration_crud(self):
        """Public can read store config; Admin can update and retrieve changes."""
        # Public read
        res = self.client.get('/api/v1/config/store/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['legal_company_name'], 'Vee Power Electricals Private Limited')

        # Admin update
        self.client.force_authenticate(user=self.admin)
        update_res = self.client.patch('/api/v1/config/store/', {
            'brand_name': 'Vee Power Superstore',
            'support_phone': '+91 99999 88888',
        })
        self.assertEqual(update_res.status_code, status.HTTP_200_OK)
        self.store_config.refresh_from_db()
        self.assertEqual(self.store_config.brand_name, 'Vee Power Superstore')
        self.assertEqual(self.store_config.support_phone, '+91 99999 88888')

    # -------------------------------------------------------------
    # 2. Company RBAC
    # -------------------------------------------------------------
    def test_company_rbac(self):
        """Anonymous and Retail customer cannot mutate company configuration (401/403)."""
        # Anonymous mutation
        res_anon = self.client.patch('/api/v1/config/store/', {'brand_name': 'Hacked Brand'})
        self.assertEqual(res_anon.status_code, status.HTTP_401_UNAUTHORIZED)

        # Retail customer mutation
        self.client.force_authenticate(user=self.customer)
        res_cust = self.client.patch('/api/v1/config/store/', {'brand_name': 'Customer Brand'})
        self.assertEqual(res_cust.status_code, status.HTTP_403_FORBIDDEN)

    # -------------------------------------------------------------
    # 3. GSTIN Validation
    # -------------------------------------------------------------
    def test_gstin_validation(self):
        """Strict statutory Indian 15-character GSTIN regex validation."""
        self.client.force_authenticate(user=self.admin)
        # Invalid GSTIN (too short)
        res_short = self.client.patch('/api/v1/config/store/', {'gstin': 'INVALID_GST'})
        self.assertEqual(res_short.status_code, status.HTTP_400_BAD_REQUEST)

        # Invalid GSTIN (PAN segment mismatch)
        res_mismatch = self.client.patch('/api/v1/config/store/', {
            'gstin': '33ZZZZZ9999Z1ZX',
            'pan': 'AABFV1234A',
        })
        self.assertEqual(res_mismatch.status_code, status.HTTP_400_BAD_REQUEST)

        # Valid GSTIN
        res_valid = self.client.patch('/api/v1/config/store/', {
            'gstin': '33AABFV1234A1ZX',
            'pan': 'AABFV1234A',
        })
        self.assertEqual(res_valid.status_code, status.HTTP_200_OK)

    # -------------------------------------------------------------
    # 4. Tax CRUD
    # -------------------------------------------------------------
    def test_tax_crud(self):
        """Admin can list, retrieve, create, update, and delete tax configurations."""
        self.client.force_authenticate(user=self.admin)
        create_res = self.client.post('/api/v1/config/tax/', {
            'tax_name': 'Commercial 12% GST',
            'default_tax_rate': '12.00',
            'cgst_rate': '6.00',
            'sgst_rate': '6.00',
            'igst_rate': '12.00',
            'tax_calculation_mode': 'TAX_EXCLUSIVE',
            'business_state': 'Kerala',
            'version_number': 2,
            'is_active': False,
        })
        self.assertEqual(create_res.status_code, status.HTTP_201_CREATED)
        tax_id = create_res.data['id']

        # Update
        patch_res = self.client.patch(f'/api/v1/config/tax/{tax_id}/', {'tax_name': 'Commercial 12% GST Updated'})
        self.assertEqual(patch_res.status_code, status.HTTP_200_OK)
        self.assertEqual(patch_res.data['tax_name'], 'Commercial 12% GST Updated')

        # Delete
        del_res = self.client.delete(f'/api/v1/config/tax/{tax_id}/')
        self.assertEqual(del_res.status_code, status.HTTP_204_NO_CONTENT)

    # -------------------------------------------------------------
    # 5. Tax Effective Dates
    # -------------------------------------------------------------
    def test_tax_effective_dates(self):
        """Tax configurations are retrieved based on target_date against effective date intervals."""
        # Period A: Until 2026-12-31 (18% tax)
        self.tax_config.effective_from = timezone.now() - timedelta(days=100)
        self.tax_config.effective_until = timezone.now() - timedelta(days=10)
        self.tax_config.save()

        # Period B: Starting from 10 days ago (28% tax)
        tax_b = TaxConfiguration.objects.create(
            tax_name='Revised GST 2026',
            default_tax_rate=Decimal('28.00'),
            cgst_rate=Decimal('14.00'),
            sgst_rate=Decimal('14.00'),
            igst_rate=Decimal('28.00'),
            tax_calculation_mode=TaxMode.TAX_EXCLUSIVE,
            business_state='Tamil Nadu',
            effective_from=timezone.now() - timedelta(days=9),
            effective_until=timezone.now() + timedelta(days=200),
            version_number=2,
            is_active=True,
            created_by=self.admin,
        )

        # Historical query (20 days ago) should resolve Period A (18%)
        hist_date = timezone.now() - timedelta(days=20)
        hist_config = TaxService.get_active_tax_configuration(target_date=hist_date)
        self.assertEqual(hist_config.id, self.tax_config.id)
        self.assertEqual(hist_config.default_tax_rate, Decimal('18.00'))

        # Current query should resolve Period B (28%)
        curr_config = TaxService.get_active_tax_configuration(target_date=timezone.now())
        self.assertEqual(curr_config.id, tax_b.id)
        self.assertEqual(curr_config.default_tax_rate, Decimal('28.00'))

    # -------------------------------------------------------------
    # 6. Overlapping Tax Rejection
    # -------------------------------------------------------------
    def test_overlapping_tax_rejection(self):
        """Creating an active TaxConfiguration overlapping an existing active configuration is rejected."""
        self.client.force_authenticate(user=self.admin)
        # Attempt to create active tax config for Tamil Nadu overlapping self.tax_config
        res = self.client.post('/api/v1/config/tax/', {
            'tax_name': 'Overlapping Active GST',
            'default_tax_rate': '18.00',
            'cgst_rate': '9.00',
            'sgst_rate': '9.00',
            'igst_rate': '18.00',
            'business_state': 'Tamil Nadu',
            'effective_from': timezone.now().isoformat(),
            'effective_until': (timezone.now() + timedelta(days=100)).isoformat(),
            'version_number': 3,
            'is_active': True,
        })
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('overlap', str(res.data).lower())

    # -------------------------------------------------------------
    # 7. Intra-State Tax
    # -------------------------------------------------------------
    def test_intra_state_tax(self):
        """Intra-state supply (Tamil Nadu -> Tamil Nadu) splits tax into 50% CGST + 50% SGST, IGST=0."""
        res = TaxService.calculate_tax(
            amount=Decimal('1000.00'),
            destination_state='Tamil Nadu',
            tax_config=self.tax_config,
        )
        self.assertTrue(res.is_intra_state)
        self.assertEqual(res.cgst_amount, Decimal('90.00'))
        self.assertEqual(res.sgst_amount, Decimal('90.00'))
        self.assertEqual(res.igst_amount, Decimal('0.00'))
        self.assertEqual(res.total_tax_amount, Decimal('180.00'))
        self.assertEqual(res.total_amount, Decimal('1180.00'))

    # -------------------------------------------------------------
    # 8. Inter-State Tax
    # -------------------------------------------------------------
    def test_inter_state_tax(self):
        """Inter-state supply (Tamil Nadu -> Kerala) levies 100% IGST, CGST=0, SGST=0."""
        res = TaxService.calculate_tax(
            amount=Decimal('1000.00'),
            destination_state='Kerala',
            tax_config=self.tax_config,
        )
        self.assertFalse(res.is_intra_state)
        self.assertEqual(res.cgst_amount, Decimal('0.00'))
        self.assertEqual(res.sgst_amount, Decimal('0.00'))
        self.assertEqual(res.igst_amount, Decimal('180.00'))
        self.assertEqual(res.total_tax_amount, Decimal('180.00'))
        self.assertEqual(res.total_amount, Decimal('1180.00'))

    # -------------------------------------------------------------
    # 9. Delivery Configuration
    # -------------------------------------------------------------
    def test_delivery_configuration(self):
        """Delivery configuration properties and negative parameter rejection."""
        self.client.force_authenticate(user=self.admin)
        res_neg = self.client.patch(f'/api/v1/config/delivery/{self.delivery_config.id}/', {
            'base_delivery_charge': '-20.00',
        })
        self.assertEqual(res_neg.status_code, status.HTTP_400_BAD_REQUEST)

        res_ok = self.client.patch(f'/api/v1/config/delivery/{self.delivery_config.id}/', {
            'base_delivery_charge': '120.00',
        })
        self.assertEqual(res_ok.status_code, status.HTTP_200_OK)
        self.delivery_config.refresh_from_db()
        self.assertEqual(self.delivery_config.base_delivery_charge, Decimal('120.00'))

    # -------------------------------------------------------------
    # 10. Free Delivery Threshold
    # -------------------------------------------------------------
    def test_free_delivery_threshold(self):
        """Orders >= threshold receive free shipping; orders below pay authoritative fee."""
        # Threshold is ₹2,000.00
        # ₹1,999.99 pays tariff
        res_below = DeliveryService.calculate_delivery(
            destination_state='Tamil Nadu',
            taxable_amount=Decimal('1999.99'),
            distance_km=Decimal('5.00'),
            delivery_config=self.delivery_config,
        )
        self.assertFalse(res_below.is_free_delivery)
        self.assertEqual(res_below.final_shipping_fee, Decimal('40.00'))

        # ₹2,000.00 qualifies for free shipping
        res_exact = DeliveryService.calculate_delivery(
            destination_state='Tamil Nadu',
            taxable_amount=Decimal('2000.00'),
            distance_km=Decimal('5.00'),
            delivery_config=self.delivery_config,
        )
        self.assertTrue(res_exact.is_free_delivery)
        self.assertEqual(res_exact.final_shipping_fee, Decimal('0.00'))

    # -------------------------------------------------------------
    # 11. Distance Slab CRUD
    # -------------------------------------------------------------
    def test_distance_slab_crud(self):
        """Admin can manage distance slabs; minimum distance cannot exceed maximum distance."""
        self.client.force_authenticate(user=self.admin)
        # Invalid range: min > max
        res_bad = self.client.post('/api/v1/config/slabs/', {
            'delivery_config': self.delivery_config.id,
            'min_distance_km': '50.00',
            'max_distance_km': '40.00',
            'rate': '150.00',
        })
        self.assertEqual(res_bad.status_code, status.HTTP_400_BAD_REQUEST)

        # Valid slab
        res_ok = self.client.post('/api/v1/config/slabs/', {
            'delivery_config': self.delivery_config.id,
            'min_distance_km': '30.00',
            'max_distance_km': '50.00',
            'rate': '160.00',
            'sort_order': 4,
        })
        self.assertEqual(res_ok.status_code, status.HTTP_201_CREATED)

    # -------------------------------------------------------------
    # 12. Distance Boundaries
    # -------------------------------------------------------------
    def test_distance_boundaries(self):
        """
        Verify canonical half-open interval [min_km, max_km):
        Slab 1: [0, 10) -> 40.00
        Slab 2: [10, 20) -> 80.00
        Slab 3: [20, 30) -> 120.00
        Exact boundaries: 9.99, 10.00, 10.01, 19.99, 20.00, 20.01
        """
        # 9.99 km -> Slab 1 (40.00)
        r_999 = DeliveryService.calculate_delivery(distance_km=Decimal('9.99'), delivery_config=self.delivery_config)
        self.assertEqual(r_999.calculated_fee, Decimal('40.00'))

        # 10.00 km -> Slab 2 (80.00)
        r_1000 = DeliveryService.calculate_delivery(distance_km=Decimal('10.00'), delivery_config=self.delivery_config)
        self.assertEqual(r_1000.calculated_fee, Decimal('80.00'))

        # 10.01 km -> Slab 2 (80.00)
        r_1001 = DeliveryService.calculate_delivery(distance_km=Decimal('10.01'), delivery_config=self.delivery_config)
        self.assertEqual(r_1001.calculated_fee, Decimal('80.00'))

        # 19.99 km -> Slab 2 (80.00)
        r_1999 = DeliveryService.calculate_delivery(distance_km=Decimal('19.99'), delivery_config=self.delivery_config)
        self.assertEqual(r_1999.calculated_fee, Decimal('80.00'))

        # 20.00 km -> Slab 3 (120.00)
        r_2000 = DeliveryService.calculate_delivery(distance_km=Decimal('20.00'), delivery_config=self.delivery_config)
        self.assertEqual(r_2000.calculated_fee, Decimal('120.00'))

        # 20.01 km -> Slab 3 (120.00)
        r_2001 = DeliveryService.calculate_delivery(distance_km=Decimal('20.01'), delivery_config=self.delivery_config)
        self.assertEqual(r_2001.calculated_fee, Decimal('120.00'))

    # -------------------------------------------------------------
    # 13. Overlapping Slab Rejection
    # -------------------------------------------------------------
    def test_overlapping_slab_rejection(self):
        """Active distance slabs with overlapping intervals are strictly rejected."""
        self.client.force_authenticate(user=self.admin)
        # Attempt to create slab [5, 15) which overlaps [0, 10) and [10, 20)
        res = self.client.post('/api/v1/config/slabs/', {
            'delivery_config': self.delivery_config.id,
            'min_distance_km': '5.00',
            'max_distance_km': '15.00',
            'rate': '70.00',
            'is_active': True,
        })
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('overlap', str(res.data).lower())

    # -------------------------------------------------------------
    # 14. Shipping Rules
    # -------------------------------------------------------------
    def test_shipping_rules(self):
        """Regional shipping rule applies when distance is absent; falls back deterministically."""
        # Destination: Karnataka (Rule exists -> 180.00)
        res_ka = DeliveryService.calculate_delivery(
            destination_state='Karnataka',
            distance_km=None,
            delivery_config=self.delivery_config,
        )
        self.assertEqual(res_ka.calculated_fee, Decimal('180.00'))

        # Destination: Maharashtra (No rule -> Fallback regional rate 150.00)
        res_mh = DeliveryService.calculate_delivery(
            destination_state='Maharashtra',
            distance_km=None,
            delivery_config=self.delivery_config,
        )
        self.assertEqual(res_mh.calculated_fee, Decimal('150.00'))

    # -------------------------------------------------------------
    # 15. Discount Validation
    # -------------------------------------------------------------
    def test_discount_validation(self):
        """OrderDiscount minimum order threshold and percentage capping validation."""
        # Order amount ₹800 < minimum ₹1,000 -> Rejected
        res_below = DiscountService.evaluate_order_discount(
            code='SAVE20',
            order_amount=Decimal('800.00'),
        )
        self.assertFalse(res_below.is_valid)
        self.assertIn('minimum order', res_below.error_message.lower())

        # Order amount ₹2,000 -> 20% is ₹400 (under ₹500 cap)
        res_ok = DiscountService.evaluate_order_discount(
            code='SAVE20',
            order_amount=Decimal('2000.00'),
        )
        self.assertTrue(res_ok.is_valid)
        self.assertEqual(res_ok.calculated_discount, Decimal('400.00'))

        # Order amount ₹4,000 -> 20% is ₹800 (capped at ₹500 cap)
        res_cap = DiscountService.evaluate_order_discount(
            code='SAVE20',
            order_amount=Decimal('4000.00'),
        )
        self.assertEqual(res_cap.calculated_discount, Decimal('500.00'))

    # -------------------------------------------------------------
    # 16. Discount Expiration
    # -------------------------------------------------------------
    def test_discount_expiration(self):
        """Expired or inactive coupon codes are rejected with clean error messages."""
        expired = OrderDiscount.objects.create(
            code='EXPIRED50',
            discount_type=DiscountType.FIXED,
            discount_value=Decimal('50.00'),
            valid_from=timezone.now() - timedelta(days=30),
            valid_until=timezone.now() - timedelta(days=1),
            is_active=True,
        )
        res = DiscountService.evaluate_order_discount(code='EXPIRED50', order_amount=Decimal('500.00'))
        self.assertFalse(res.is_valid)
        self.assertIn('expired', res.error_message.lower())

    # -------------------------------------------------------------
    # 17. Discount Stacking
    # -------------------------------------------------------------
    def test_discount_stacking(self):
        """Coupon allow_stacking attribute and combined discount validation."""
        coupon_stack = OrderDiscount.objects.create(
            code='STACKABLE',
            discount_type=DiscountType.PERCENTAGE,
            discount_value=Decimal('10.00'),
            allow_stacking=True,
            is_active=True,
        )
        self.assertTrue(coupon_stack.allow_stacking)

    # -------------------------------------------------------------
    # 18. 50% Discount Cap
    # -------------------------------------------------------------
    def test_50_percent_discount_cap(self):
        """Hard ceiling: total combined savings cannot exceed 50% of order subtotal."""
        huge_coupon = OrderDiscount.objects.create(
            code='HUGE70',
            discount_type=DiscountType.PERCENTAGE,
            discount_value=Decimal('70.00'),
            is_active=True,
        )
        # Order amount ₹1,000.00. 70% would be ₹700, but cap is 50% = ₹500.00
        res = DiscountService.evaluate_order_discount(code='HUGE70', order_amount=Decimal('1000.00'))
        self.assertEqual(res.calculated_discount, Decimal('500.00'))

    # -------------------------------------------------------------
    # 19. Audit Logging
    # -------------------------------------------------------------
    def test_audit_logging(self):
        """Admin modifications create sanitized records in AdminConfigAuditLog."""
        initial_count = AdminConfigAuditLog.objects.count()
        self.client.force_authenticate(user=self.admin)
        res = self.client.patch('/api/v1/config/store/', {
            'brand_name': 'Vee Power Audit Test',
            'change_reason': 'Annual corporate rebranding',
        })
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(AdminConfigAuditLog.objects.count(), initial_count + 1)
        latest_log = AdminConfigAuditLog.objects.first()
        self.assertEqual(latest_log.domain, 'store')
        self.assertEqual(latest_log.action_type, 'UPDATE')
        self.assertEqual(latest_log.admin_user, self.admin)
        self.assertEqual(latest_log.change_reason, 'Annual corporate rebranding')

    # -------------------------------------------------------------
    # 20. Historical Transaction Isolation
    # -------------------------------------------------------------
    def test_historical_transaction_isolation(self):
        """Changing TaxConfiguration, DeliveryConfiguration, or Discounts never mutates existing transactions."""
        # 1. Create an Order using 18% tax and ₹40 delivery
        pipeline_res = BillingService.calculate_order(
            items_data=[{'product': self.product, 'quantity': 1}],
            destination_state='Tamil Nadu',
            distance_km=Decimal('5.00'),
        )
        order = Order.objects.create(
            order_number='ORD-HIST-001',
            user=self.customer,
            customer_name='Customer One',
            customer_email=self.customer.email,
            customer_phone='9876543210',
            subtotal=pipeline_res.subtotal,
            taxable_amount=pipeline_res.taxable_amount,
            tax_amount=pipeline_res.tax_amount,
            cgst_amount=pipeline_res.cgst_amount,
            sgst_amount=pipeline_res.sgst_amount,
            igst_amount=pipeline_res.igst_amount,
            shipping_fee=pipeline_res.shipping_fee,
            total_amount=pipeline_res.total_amount,
            calculation_snapshot=pipeline_res.calculation_snapshot,
            status=OrderStatus.PENDING,
            payment_status=PaymentStatus.PENDING,
            shipping_address={'state': 'Tamil Nadu', 'pincode': '641031'},
        )
        order_orig_tax = order.tax_amount
        order_orig_total = order.total_amount
        order_orig_shipping = order.shipping_fee

        # 2. Mutate active TaxConfiguration (change rate from 18% to 28%)
        self.tax_config.default_tax_rate = Decimal('28.00')
        self.tax_config.cgst_rate = Decimal('14.00')
        self.tax_config.sgst_rate = Decimal('14.00')
        self.tax_config.save()

        # 3. Mutate active DeliveryConfiguration (change base fee from 100 to 200)
        self.delivery_config.base_delivery_charge = Decimal('200.00')
        self.delivery_config.save()

        # 4. Mutate distance slab rate
        self.slab1.rate = Decimal('99.00')
        self.slab1.save()

        # 5. Reload historical order and verify zero change
        order.refresh_from_db()
        self.assertEqual(order.tax_amount, order_orig_tax)
        self.assertEqual(order.total_amount, order_orig_total)
        self.assertEqual(order.shipping_fee, order_orig_shipping)
        self.assertEqual(order.calculation_snapshot['tax_breakdown']['total_rate_percent'], '18.00')

    # -------------------------------------------------------------
    # 21. API Security
    # -------------------------------------------------------------
    def test_api_security(self):
        """Unauthenticated mutation rejected (401); SQL injection strings and malformed values return 400."""
        # Unauthenticated mutation
        res_401 = self.client.post('/api/v1/config/tax/', {'tax_name': 'Hacked Tax'})
        self.assertEqual(res_401.status_code, status.HTTP_401_UNAUTHORIZED)

        # Authenticate admin
        self.client.force_authenticate(user=self.admin)
        # Malformed ID
        res_404 = self.client.get('/api/v1/config/tax/999999/')
        self.assertEqual(res_404.status_code, status.HTTP_404_NOT_FOUND)

        # SQL Injection attempt in Decimal field
        res_sqli = self.client.post('/api/v1/config/tax/', {
            'tax_name': "GST'; DROP TABLE users; --",
            'default_tax_rate': "18.00 OR 1=1",
            'cgst_rate': '9.00',
            'sgst_rate': '9.00',
            'igst_rate': '18.00',
            'tax_calculation_mode': 'TAX_EXCLUSIVE',
            'business_state': 'Tamil Nadu',
        })
        self.assertEqual(res_sqli.status_code, status.HTTP_400_BAD_REQUEST)

    # -------------------------------------------------------------
    # 22. Concurrent Configuration Update
    # -------------------------------------------------------------
    def test_concurrent_configuration_update(self):
        """Simultaneous configuration updates and singleton locks prevent conflicting configurations."""
        # 1. Enforce singleton lock: cannot create a second CompanyStoreConfiguration
        with self.assertRaises(DjangoValidationError):
            second_store = CompanyStoreConfiguration(
                legal_company_name='Vee Power Branch 2',
                brand_name='Vee Power Branch',
                gstin='33AABFV1234A1ZX',
            )
            second_store.save()

        # 2. Row-level lock update simulation
        from django.db import transaction
        with transaction.atomic():
            store = CompanyStoreConfiguration.objects.select_for_update().get(id=self.store_config.id)
            store.brand_name = "Vee Power Locked Update"
            store.save()

        self.store_config.refresh_from_db()
        self.assertEqual(self.store_config.brand_name, "Vee Power Locked Update")

        # 3. Two successive rapid API updates maintain consistent state
        self.client.force_authenticate(user=self.admin)
        res1 = self.client.patch('/api/v1/config/store/', {'brand_name': 'Vee Power Concur 1'})
        res2 = self.client.patch('/api/v1/config/store/', {'brand_name': 'Vee Power Concur 2'})
        self.assertEqual(res1.status_code, status.HTTP_200_OK)
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        self.store_config.refresh_from_db()
        self.assertEqual(self.store_config.brand_name, 'Vee Power Concur 2')

    # -------------------------------------------------------------
    # 23. Secret Exposure Prevention
    # -------------------------------------------------------------
    def test_secret_exposure_prevention(self):
        """Audit logging and public config endpoints sanitize credentials and secrets."""
        # Verify sanitization function strips secrets
        test_payload = {
            'public_name': 'Vee Power',
            'api_secret': 'super_secret_key_123',
            'razorpay_key_secret': 'rzp_sec_xyz',
            'nested': {
                'password': 'PlainTextPassword!',
                'token': 'jwt.token.here',
                'safe_field': 12345
            }
        }
        sanitized = sanitize_audit_payload(test_payload)
        self.assertNotIn('api_secret', sanitized)
        self.assertNotIn('razorpay_key_secret', sanitized)
        self.assertNotIn('password', sanitized['nested'])
        self.assertNotIn('token', sanitized['nested'])
        self.assertIn('safe_field', sanitized['nested'])

        # Verify audit logs endpoint requires admin privileges
        res_public_audit = self.client.get('/api/v1/config/audit-logs/')
        self.assertEqual(res_public_audit.status_code, status.HTTP_401_UNAUTHORIZED)

    # -------------------------------------------------------------
    # 24. N+1 Regression
    # -------------------------------------------------------------
    def test_n_plus_one_regression(self):
        """Listing delivery configurations with distance slabs executes constant query count."""
        # Create additional delivery configs with slabs
        for i in range(5):
            dc = DeliveryConfiguration.objects.create(
                origin_name=f"Hub {i}",
                origin_city=f"City {i}",
                origin_state="Tamil Nadu",
                origin_pincode="641001",
                version_number=i + 10,
                is_active=True,
            )
            for s in range(3):
                DistanceSlab.objects.create(
                    delivery_config=dc,
                    min_distance_km=Decimal(f"{s * 10}.00"),
                    max_distance_km=Decimal(f"{(s + 1) * 10}.00"),
                    rate=Decimal("50.00"),
                )

        self.client.force_authenticate(user=self.admin)
        with self.assertNumQueries(3):  # 1 count, 1 delivery_configs, 1 prefetched slabs (flat query count, zero N+1)
            res = self.client.get('/api/v1/config/delivery/')
            self.assertEqual(res.status_code, status.HTTP_200_OK)
            self.assertGreaterEqual(len(res.data['results']), 5)
