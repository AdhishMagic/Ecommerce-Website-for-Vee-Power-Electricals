from decimal import Decimal
from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.commercial_config.models import (
    CompanyStoreConfiguration,
    TaxConfiguration,
    DeliveryConfiguration,
    DistanceSlab,
    ShippingRule,
    OrderDiscount,
    DiscountType,
)
from apps.commercial_config.services import (
    TaxService,
    DiscountService,
    DeliveryService,
    BillingService,
)

User = get_user_model()


class Phase7BillingEdgesTestCase(TestCase):
    """
    Mathematical, Boundary, and Precision tests for Tax, Discount, Delivery, and Billing (Phase 7).
    """

    def setUp(self):
        # 1. Tax Config
        self.tax_config = TaxConfiguration.objects.create(
            business_state='Tamil Nadu',
            default_tax_rate=Decimal('18.00'),
            cgst_rate=Decimal('9.00'),
            sgst_rate=Decimal('9.00'),
            igst_rate=Decimal('18.00'),
            is_active=True,
            version_number=1,
        )

        # 2. Delivery Config with half-open slabs
        self.delivery_config = DeliveryConfiguration.objects.create(
            origin_name='Main Warehouse',
            origin_address='Peelamedu',
            origin_city='Coimbatore',
            origin_state='Tamil Nadu',
            origin_pincode='641004',
            latitude=Decimal('11.0168'),
            longitude=Decimal('76.9558'),
            base_delivery_charge=Decimal('60.00'),
            free_delivery_threshold=Decimal('1000.00'),
            is_active=True,
        )

        # Continuous slabs: [0, 10), [10, 25), [25, 50)
        self.slab1 = DistanceSlab.objects.create(
            delivery_config=self.delivery_config,
            min_distance_km=Decimal('0.00'),
            max_distance_km=Decimal('10.00'),
            rate=Decimal('40.00'),
            is_active=True,
        )
        self.slab2 = DistanceSlab.objects.create(
            delivery_config=self.delivery_config,
            min_distance_km=Decimal('10.00'),
            max_distance_km=Decimal('25.00'),
            rate=Decimal('80.00'),
            is_active=True,
        )
        self.slab3 = DistanceSlab.objects.create(
            delivery_config=self.delivery_config,
            min_distance_km=Decimal('25.00'),
            max_distance_km=Decimal('50.00'),
            rate=Decimal('120.00'),
            is_active=True,
        )

        # 3. Coupons
        self.pct_coupon = OrderDiscount.objects.create(
            code='EDGE20',
            discount_type=DiscountType.PERCENTAGE,
            discount_value=Decimal('20.00'),
            min_order_value=Decimal('500.00'),
            max_discount_cap=Decimal('150.00'),
            is_active=True,
        )
        self.fixed_coupon = OrderDiscount.objects.create(
            code='FIXED100',
            discount_type=DiscountType.FIXED,
            discount_value=Decimal('100.00'),
            min_order_value=Decimal('50.00'),
            is_active=True,
        )

    # -------------------------------------------------------------
    # 1. Tax Engine Boundary & Reverse Extraction Tests
    # -------------------------------------------------------------
    def test_tax_exclusive_intra_state_split(self):
        """Tax exclusive intra-state splits 18% into exactly 9% CGST and 9% SGST."""
        res = TaxService.calculate_tax(
            amount=Decimal('100.00'),
            destination_state='Tamil Nadu',
            override_tax_mode='TAX_EXCLUSIVE',
        )
        self.assertTrue(res.is_intra_state)
        self.assertEqual(res.taxable_amount, Decimal('100.00'))
        self.assertEqual(res.cgst_amount, Decimal('9.00'))
        self.assertEqual(res.sgst_amount, Decimal('9.00'))
        self.assertEqual(res.igst_amount, Decimal('0.00'))
        self.assertEqual(res.total_tax_amount, Decimal('18.00'))
        self.assertEqual(res.total_amount, Decimal('118.00'))

    def test_tax_inclusive_reverse_extraction_rounding(self):
        """Tax inclusive reverse extraction on ₹100.00 at 18% rounds cleanly with Decimal precision."""
        res = TaxService.calculate_tax(
            amount=Decimal('100.00'),
            destination_state='Tamil Nadu',
            override_tax_mode='TAX_INCLUSIVE',
        )
        # Taxable amount = 100 / 1.18 = 84.75
        self.assertEqual(res.taxable_amount, Decimal('84.75'))
        # Total tax = 100 - 84.75 = 15.25
        self.assertEqual(res.total_tax_amount, Decimal('15.25'))
        self.assertEqual(res.cgst_amount + res.sgst_amount, Decimal('15.25'))
        self.assertEqual(res.total_amount, Decimal('100.00'))

    def test_tax_inter_state_igst_allocation(self):
        """Inter-state destination allocates 100% tax to IGST and 0 to CGST/SGST."""
        res = TaxService.calculate_tax(
            amount=Decimal('200.00'),
            destination_state='Karnataka',
            override_tax_mode='TAX_EXCLUSIVE',
        )
        self.assertFalse(res.is_intra_state)
        self.assertEqual(res.cgst_amount, Decimal('0.00'))
        self.assertEqual(res.sgst_amount, Decimal('0.00'))
        self.assertEqual(res.igst_amount, Decimal('36.00'))
        self.assertEqual(res.total_tax_amount, Decimal('36.00'))
        self.assertEqual(res.total_amount, Decimal('236.00'))

    def test_tax_zero_amount(self):
        """₹0.00 taxable amount yields ₹0.00 tax."""
        res_zero = TaxService.calculate_tax(
            amount=Decimal('0.00'),
            destination_state='Tamil Nadu',
            override_tax_mode='TAX_EXCLUSIVE',
        )
        self.assertEqual(res_zero.total_tax_amount, Decimal('0.00'))
        self.assertEqual(res_zero.total_amount, Decimal('0.00'))

    # -------------------------------------------------------------
    # 2. Discount Boundaries & Stacking Cap Tests
    # -------------------------------------------------------------
    def test_discount_min_order_value_exact_vs_below(self):
        """Order subtotal exactly equal to min_order_value passes; ₹0.01 below fails."""
        # Exact minimum: ₹500.00
        val_exact = DiscountService.evaluate_order_discount(
            code='EDGE20',
            order_amount=Decimal('500.00'),
        )
        self.assertTrue(val_exact.is_valid)

        # Below minimum: ₹499.99
        val_below = DiscountService.evaluate_order_discount(
            code='EDGE20',
            order_amount=Decimal('499.99'),
        )
        self.assertFalse(val_below.is_valid)
        self.assertIn('minimum order', val_below.error_message.lower())

    def test_discount_percentage_max_cap(self):
        """Percentage discount is capped when calculated savings exceed max_discount_cap."""
        # 20% on ₹1,000 = ₹200. Cap is ₹150.
        res = DiscountService.evaluate_order_discount(
            code='EDGE20',
            order_amount=Decimal('1000.00'),
        )
        self.assertEqual(res.calculated_discount, Decimal('150.00'))

        # 20% on ₹600 = ₹120. Below cap of ₹150.
        res2 = DiscountService.evaluate_order_discount(
            code='EDGE20',
            order_amount=Decimal('600.00'),
        )
        self.assertEqual(res2.calculated_discount, Decimal('120.00'))

    def test_fixed_discount_greater_than_subtotal_capped(self):
        """Fixed discount exceeding order subtotal is capped by the 50% maximum discount limit."""
        # Order amount = 50.00, coupon value = 100.00 -> 50% cap limits discount to 25.00
        res = DiscountService.evaluate_order_discount(
            code='FIXED100',
            order_amount=Decimal('50.00'),
        )
        self.assertEqual(res.calculated_discount, Decimal('25.00'))

    def test_combined_discount_hard_cap_at_50_percent(self):
        """Combined catalog and promotional discounts cannot exceed 50% of the subtotal."""
        # Subtotal: ₹1,000. Already discounted by ₹450 in catalog.
        # Max allowed total savings is 50% = ₹500.
        # So additional coupon discount is capped at ₹50.
        res = DiscountService.evaluate_order_discount(
            code='EDGE20',
            order_amount=Decimal('1000.00'),
            existing_product_discounts=Decimal('450.00'),
        )
        self.assertEqual(res.calculated_discount, Decimal('50.00'))

    # -------------------------------------------------------------
    # 3. Delivery Tariff & Distance Slab Boundary Tests
    # -------------------------------------------------------------
    def test_distance_slab_continuous_half_open_boundaries(self):
        """
        Tests continuous half-open interval [min, max) boundaries:
        - 0.00 km -> Slab 1 (rate 40.00)
        - 9.99 km -> Slab 1 (rate 40.00)
        - 10.00 km -> Slab 2 (rate 80.00)
        - 24.99 km -> Slab 2 (rate 80.00)
        - 25.00 km -> Slab 3 (rate 120.00)
        """
        # Exact slab 1 min boundary
        charge_0 = DeliveryService.calculate_delivery(
            destination_state='Tamil Nadu',
            distance_km=Decimal('0.00'),
            subtotal=Decimal('500.00'),
        )
        self.assertEqual(charge_0.shipping_fee, Decimal('40.00'))

        # Inside slab 1
        charge_9_99 = DeliveryService.calculate_delivery(
            destination_state='Tamil Nadu',
            distance_km=Decimal('9.99'),
            subtotal=Decimal('500.00'),
        )
        self.assertEqual(charge_9_99.shipping_fee, Decimal('40.00'))

        # Exact slab 2 min boundary (transition point from slab 1)
        charge_10 = DeliveryService.calculate_delivery(
            destination_state='Tamil Nadu',
            distance_km=Decimal('10.00'),
            subtotal=Decimal('500.00'),
        )
        self.assertEqual(charge_10.shipping_fee, Decimal('80.00'))

        # Inside slab 2
        charge_24_99 = DeliveryService.calculate_delivery(
            destination_state='Tamil Nadu',
            distance_km=Decimal('24.99'),
            subtotal=Decimal('500.00'),
        )
        self.assertEqual(charge_24_99.shipping_fee, Decimal('80.00'))

        # Exact slab 3 min boundary (transition point from slab 2)
        charge_25 = DeliveryService.calculate_delivery(
            destination_state='Tamil Nadu',
            distance_km=Decimal('25.00'),
            subtotal=Decimal('500.00'),
        )
        self.assertEqual(charge_25.shipping_fee, Decimal('120.00'))

    def test_free_delivery_threshold_exact_vs_below(self):
        """Order subtotal exactly equal to free_delivery_threshold gets free delivery; ₹0.01 below is charged."""
        # Exactly ₹1,000.00
        charge_free = DeliveryService.calculate_delivery(
            destination_state='Tamil Nadu',
            distance_km=Decimal('15.00'),
            subtotal=Decimal('1000.00'),
        )
        self.assertTrue(charge_free.is_free_delivery)
        self.assertEqual(charge_free.shipping_fee, Decimal('0.00'))

        # ₹999.99
        charge_paid = DeliveryService.calculate_delivery(
            destination_state='Tamil Nadu',
            distance_km=Decimal('15.00'),
            subtotal=Decimal('999.99'),
        )
        self.assertFalse(charge_paid.is_free_delivery)
        self.assertEqual(charge_paid.shipping_fee, Decimal('80.00'))
