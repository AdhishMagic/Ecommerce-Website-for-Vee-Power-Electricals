from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

from apps.commercial_config.models import TaxConfiguration, CompanyStoreConfiguration


@dataclass(frozen=True)
class TaxCalculationResult:
    tax_mode: str
    tax_type: str
    is_intra_state: bool
    taxable_amount: Decimal
    cgst_rate: Decimal
    cgst_amount: Decimal
    sgst_rate: Decimal
    sgst_amount: Decimal
    igst_rate: Decimal
    igst_amount: Decimal
    total_tax_rate: Decimal
    total_tax_amount: Decimal

    @property
    def tax_amount(self) -> Decimal:
        return self.total_tax_amount

    @property
    def total_amount(self) -> Decimal:
        return self.taxable_amount + self.total_tax_amount


class TaxService:
    """
    Statutory Indian GST calculation engine for retail e-commerce and commercial contracting.
    Supports Intra-State (CGST + SGST) and Inter-State (IGST) taxation across
    both TAX_EXCLUSIVE and TAX_INCLUSIVE pricing regimes.
    """

    DEFAULT_ORIGIN_STATE = 'Tamil Nadu'
    DEFAULT_GST_RATE = Decimal('18.00')

    @classmethod
    def get_active_tax_configuration(cls) -> Optional[TaxConfiguration]:
        return TaxConfiguration.objects.filter(is_active=True).order_by('-version_number').first()

    @classmethod
    def get_origin_state(cls) -> str:
        tax_config = cls.get_active_tax_configuration()
        if tax_config and tax_config.business_state:
            return tax_config.business_state.strip()
        return cls.DEFAULT_ORIGIN_STATE

    @classmethod
    def calculate_tax(
        cls,
        amount: Decimal,
        destination_state: str,
        tax_config: Optional[TaxConfiguration] = None,
        override_tax_mode: Optional[str] = None
    ) -> TaxCalculationResult:
        """
        Calculate statutory GST components for a given taxable or gross supply amount.
        """
        if not isinstance(amount, Decimal):
            amount = Decimal(str(amount))

        if amount < Decimal('0.00'):
            raise ValueError("Tax calculation amount cannot be negative.")

        if tax_config is None:
            tax_config = cls.get_active_tax_configuration()

        tax_mode = override_tax_mode or (tax_config.tax_calculation_mode if tax_config else 'TAX_EXCLUSIVE')
        origin_state = cls.get_origin_state()
        is_intra_state = origin_state.strip().lower() == destination_state.strip().lower()

        # Resolve Rates
        if tax_config:
            default_rate = tax_config.default_tax_rate
            cgst_rate = tax_config.cgst_rate
            sgst_rate = tax_config.sgst_rate
            igst_rate = tax_config.igst_rate
        else:
            default_rate = cls.DEFAULT_GST_RATE
            cgst_rate = Decimal('9.00')
            sgst_rate = Decimal('9.00')
            igst_rate = Decimal('18.00')

        if tax_mode == 'TAX_INCLUSIVE':
            # Base = Amount / (1 + Rate / 100)
            divisor = Decimal('1.00') + (default_rate / Decimal('100.00'))
            taxable_amount = (amount / divisor).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
            total_tax = amount - taxable_amount
            if is_intra_state:
                cgst_amount = (total_tax / Decimal('2.00')).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
                sgst_amount = total_tax - cgst_amount
                igst_amount = Decimal('0.00')
            else:
                cgst_amount = Decimal('0.00')
                sgst_amount = Decimal('0.00')
                igst_amount = total_tax
        else:
            # TAX_EXCLUSIVE: Tax is added on top of taxable_amount
            taxable_amount = amount.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
            if is_intra_state:
                cgst_amount = (taxable_amount * (cgst_rate / Decimal('100.00'))).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
                sgst_amount = (taxable_amount * (sgst_rate / Decimal('100.00'))).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
                igst_amount = Decimal('0.00')
                total_tax = cgst_amount + sgst_amount
            else:
                cgst_amount = Decimal('0.00')
                sgst_amount = Decimal('0.00')
                igst_amount = (taxable_amount * (igst_rate / Decimal('100.00'))).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
                total_tax = igst_amount

        tax_type = 'INTRA_STATE_GST' if is_intra_state else 'INTER_STATE_GST'

        return TaxCalculationResult(
            tax_mode=tax_mode,
            tax_type=tax_type,
            is_intra_state=is_intra_state,
            taxable_amount=taxable_amount,
            cgst_rate=cgst_rate if is_intra_state else Decimal('0.00'),
            cgst_amount=cgst_amount,
            sgst_rate=sgst_rate if is_intra_state else Decimal('0.00'),
            sgst_amount=sgst_amount,
            igst_rate=igst_rate if not is_intra_state else Decimal('0.00'),
            igst_amount=igst_amount,
            total_tax_rate=default_rate,
            total_tax_amount=total_tax,
        )
