import io
import os
import re
import uuid
import zipfile
import urllib.request
import urllib.error
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils.text import slugify
from PIL import Image

import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

from .models import (
    Category,
    Brand,
    Product,
    ProductImage,
    ProductSpecification,
)
from .cache_utils import invalidate_catalog_cache, invalidate_brands_cache


class BulkProductImportService:
    """
    Service for generating formatted Excel import templates and processing
    bulk product imports (upsert) with companion ZIP / URL image extraction.
    """

    TEMPLATE_COLUMNS = [
        ('SKU*', 18, 'Unique Stock Keeping Unit (e.g., SCH-MCB-1P-16A)'),
        ('Product_Name*', 35, 'Full product title (e.g., Schneider Acti9 1P 16A C-Curve MCB)'),
        ('Category*', 22, 'Category name (e.g., MCB & Protection, Wires & Cables)'),
        ('Brand', 18, 'Brand / Manufacturer name (e.g., Schneider, Havells, Polycab)'),
        ('Price_INR*', 15, 'Base MRP price in INR (e.g., 280.00)'),
        ('Discount_Price_INR', 20, 'Discounted selling price in INR (must be <= Price_INR)'),
        ('Stock_Qty*', 14, 'Available stock inventory quantity (integer >= 0)'),
        ('GST_Percent*', 14, 'Applicable GST percentage: 0, 5, 12, 18, or 28'),
        ('Unit', 14, 'Unit of measure (e.g., Piece, Meter, Coil, Box, Set)'),
        ('Description', 40, 'Detailed product description and features'),
        ('Specifications', 40, 'Key-value specs separated by pipe (e.g., Poles: 1P | Current: 16A)'),
        ('Image_Source*', 28, 'Paste embedded image into cell OR provide https:// URL'),
        ('Gallery_Images', 32, 'Additional gallery images separated by comma or pipe'),
        ('Is_Active', 12, 'TRUE or FALSE (default TRUE)'),
    ]

    VALID_GST_RATES = {0, 5, 12, 18, 28}
    ALLOWED_IMAGE_EXTENSIONS = {'JPEG': 'jpg', 'PNG': 'png', 'WEBP': 'webp'}
    MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB

    @classmethod
    def generate_template_workbook(cls) -> io.BytesIO:
        """
        Generate a styled, production-ready Excel workbook (.xlsx) with:
        1. Products_Import worksheet with formatted headers and sample electrical rows.
        2. Instructions worksheet with field rules and GST rates.
        """
        wb = openpyxl.Workbook()

        # Sheet 1: Products_Import
        ws_import = wb.active
        ws_import.title = "Products_Import"

        # Theme Colors
        navy_fill = PatternFill(start_color="0A2540", end_color="0A2540", fill_type="solid")
        header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
        thin_border = Border(
            left=Side(style='thin', color='E2E8F0'),
            right=Side(style='thin', color='E2E8F0'),
            top=Side(style='thin', color='E2E8F0'),
            bottom=Side(style='thin', color='E2E8F0'),
        )
        sample_fill_1 = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")
        sample_fill_2 = PatternFill(start_color="FFFFFF", end_color="FFFFFF", fill_type="solid")

        # Write Headers
        for col_idx, (col_name, col_width, _hint) in enumerate(cls.TEMPLATE_COLUMNS, start=1):
            cell = ws_import.cell(row=1, column=col_idx, value=col_name)
            cell.fill = navy_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
            cell.border = thin_border
            col_letter = get_column_letter(col_idx)
            ws_import.column_dimensions[col_letter].width = col_width

        ws_import.row_dimensions[1].height = 28

        # Sample Rows (Realistic electrical catalog products)
        sample_data = [
            [
                "SCH-MCB-1P-16A",
                "Schneider Acti9 1P 16A C-Curve MCB",
                "MCB & Protection",
                "Schneider",
                280.00,
                245.00,
                50,
                18,
                "Piece",
                "Schneider Electric 1-Pole 16 Amp C-Curve miniature circuit breaker with 10kA breaking capacity for residential and commercial circuits.",
                "Poles: 1P | Rated Current: 16A | Breaking Capacity: 10kA | Curve: C-Curve | Voltage: 240V",
                "schneider_mcb_16a.jpg",
                "schneider_mcb_side.jpg, schneider_mcb_box.jpg",
                "TRUE",
            ],
            [
                "POLY-FR-2.5-RED",
                "Polycab Flame Retardant 2.5 sq mm Wire (Red, 90m)",
                "Wires & Cables",
                "Polycab",
                2250.00,
                1980.00,
                30,
                18,
                "Coil",
                "Polycab 2.5 sq mm single core FR PVC insulated copper wire coil 90m length with high thermal stability and flame retardant properties.",
                "Conductor: Copper | Gauge: 2.5 sq mm | Length: 90m | Color: Red | Insulation: FR PVC",
                "https://images.unsplash.com/photo-1558346490-a72e53ae2d4f?w=600",
                "",
                "TRUE",
            ],
            [
                "HAV-BATTEN-20W",
                "Havells Adore 20W Cool Day Light LED Batten",
                "Lighting",
                "Havells",
                450.00,
                399.00,
                40,
                12,
                "Piece",
                "Havells 20W LED batten light with glare-free wide spread lighting and surge protection up to 4kV.",
                "Wattage: 20W | Color Temp: 6500K (Cool Day Light) | Length: 4 Feet | Lumen: 2000 lm",
                "havells_batten_20w.jpg",
                "",
                "TRUE",
            ]
        ]

        data_font = Font(name="Calibri", size=10)
        data_align_left = Alignment(horizontal="left", vertical="center")
        data_align_right = Alignment(horizontal="right", vertical="center")
        data_align_center = Alignment(horizontal="center", vertical="center")

        for row_idx, row_values in enumerate(sample_data, start=2):
            fill = sample_fill_1 if row_idx % 2 == 0 else sample_fill_2
            ws_import.row_dimensions[row_idx].height = 22
            for col_idx, val in enumerate(row_values, start=1):
                cell = ws_import.cell(row=row_idx, column=col_idx, value=val)
                cell.font = data_font
                cell.fill = fill
                cell.border = thin_border

                if col_idx in (5, 6):  # Prices
                    cell.alignment = data_align_right
                    cell.number_format = '0.00'
                elif col_idx in (7, 8):  # Stock & GST
                    cell.alignment = data_align_right
                elif col_idx in (1, 14):  # SKU & Active
                    cell.alignment = data_align_center
                else:
                    cell.alignment = data_align_left

        # Sheet 2: Instructions & Guidelines
        ws_info = wb.create_sheet(title="Instructions")
        ws_info.column_dimensions['A'].width = 24
        ws_info.column_dimensions['B'].width = 14
        ws_info.column_dimensions['C'].width = 16
        ws_info.column_dimensions['D'].width = 65

        info_headers = ["Field Name", "Required", "Format / Type", "Rules & Example"]
        for col_idx, text in enumerate(info_headers, start=1):
            cell = ws_info.cell(row=1, column=col_idx, value=text)
            cell.fill = navy_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal="center", vertical="center")
            cell.border = thin_border
        ws_info.row_dimensions[1].height = 26

        field_guidelines = [
            ("SKU*", "YES", "Text (Alphanumeric)", "Unique identifier. Existing SKU updates product; new SKU creates product."),
            ("Product_Name*", "YES", "Text", "Full product title displayed to customers."),
            ("Category*", "YES", "Text", "Category name. Auto-created if it does not already exist."),
            ("Brand", "NO", "Text", "Brand / manufacturer name. Defaults to 'Vee Power' if left blank."),
            ("Price_INR*", "YES", "Number (Decimal)", "Maximum Retail Price (MRP) in INR. Must be > 0."),
            ("Discount_Price_INR", "NO", "Number (Decimal)", "Discounted selling price. Must be less than or equal to Price_INR."),
            ("Stock_Qty*", "YES", "Integer", "Available inventory quantity. Must be >= 0."),
            ("GST_Percent*", "YES", "Number", "Standard Indian GST slab: 0, 5, 12, 18, or 28."),
            ("Unit", "NO", "Text", "Unit of measurement (e.g. Piece, Meter, Coil, Box, Set)."),
            ("Description", "NO", "Text", "Full marketing/technical description of the product."),
            ("Specifications", "NO", "Key: Value pairs", "Technical specs separated by pipe '|' (e.g. Poles: 1P | Current: 16A)."),
            ("Image_Source*", "YES (for new)", "Embedded or URL", "Primary image. Either paste image directly into cell or provide full http(s) URL."),
            ("Gallery_Images", "NO", "Filenames or URLs", "Additional images separated by comma or pipe (e.g. img1.jpg, img2.jpg)."),
            ("Is_Active", "NO", "Boolean", "TRUE to publish in store, FALSE to keep as draft (defaults to TRUE)."),
        ]

        for r_idx, (fname, req, ftype, desc) in enumerate(field_guidelines, start=2):
            ws_info.row_dimensions[r_idx].height = 20
            ws_info.cell(row=r_idx, column=1, value=fname).alignment = Alignment(horizontal="left", vertical="center")
            req_cell = ws_info.cell(row=r_idx, column=2, value=req)
            req_cell.alignment = Alignment(horizontal="center", vertical="center")
            if req.startswith("YES"):
                req_cell.font = Font(name="Calibri", size=10, bold=True, color="B91C1C")
            ws_info.cell(row=r_idx, column=3, value=ftype).alignment = Alignment(horizontal="left", vertical="center")
            ws_info.cell(row=r_idx, column=4, value=desc).alignment = Alignment(horizontal="left", vertical="center")
            for c_idx in range(1, 5):
                ws_info.cell(row=r_idx, column=c_idx).border = thin_border

        buffer = io.BytesIO()
        wb.save(buffer)
        buffer.seek(0)
        return buffer

    @classmethod
    def get_image_row(cls, image) -> Optional[int]:
        """
        Extract 1-based row number for an embedded openpyxl image.
        openpyxl's anchor._from.row is 0-based, so + 1 converts to 1-based data row.
        """
        anchor = getattr(image, 'anchor', None)
        if not anchor:
            return None
        # OneCellAnchor / TwoCellAnchor
        if hasattr(anchor, '_from') and hasattr(anchor._from, 'row'):
            try:
                return int(anchor._from.row) + 1
            except (ValueError, TypeError):
                pass
        if hasattr(anchor, 'row'):
            try:
                return int(anchor.row)
            except (ValueError, TypeError):
                pass
        # Coordinate string or string representation fallback (e.g. 'L2')
        anchor_str = str(anchor)
        m_coord = re.search(r'([A-Za-z]+)(\d+)', anchor_str)
        if m_coord:
            return int(m_coord.group(2))
        m_row = re.search(r'row[=:\s]+(\d+)', anchor_str, re.IGNORECASE)
        if m_row:
            row_val = int(m_row.group(1))
            return row_val + 1 if 'from' in anchor_str.lower() else row_val
        return None

    @classmethod
    def save_image_bytes(cls, image_bytes: bytes, original_filename: str = "") -> str:
        """
        Validate image bytes using Pillow, convert non-standard formats (e.g., BMP, TIFF) to PNG,
        and write to settings.MEDIA_ROOT/products/<uuid>.<ext>.
        Returns relative media URL (e.g. /media/products/<uuid>.<ext>).
        """
        if not image_bytes:
            raise ValidationError(f"Image data for '{original_filename}' is empty.")

        if len(image_bytes) > cls.MAX_IMAGE_SIZE_BYTES:
            raise ValidationError(f"Image '{original_filename}' ({len(image_bytes) / 1024 / 1024:.2f}MB) exceeds the maximum allowed limit of 5MB.")

        bio = io.BytesIO(image_bytes)
        try:
            img = Image.open(bio)
            img_format = (img.format or '').upper()
            if img_format in cls.ALLOWED_IMAGE_EXTENSIONS:
                img.verify()
                ext = cls.ALLOWED_IMAGE_EXTENSIONS[img_format]
                final_bytes = image_bytes
            else:
                # Convert to PNG for maximum web compatibility
                converted_bio = io.BytesIO()
                if img.mode in ('RGBA', 'LA') or (img.mode == 'P' and 'transparency' in img.info):
                    img = img.convert('RGBA')
                else:
                    img = img.convert('RGB')
                img.save(converted_bio, format='PNG')
                final_bytes = converted_bio.getvalue()
                ext = 'png'
        except Exception as e:
            raise ValidationError(f"Invalid or corrupted image '{original_filename}': {str(e)}")

        saved_filename = f"{uuid.uuid4().hex}.{ext}"
        media_dir = Path(settings.MEDIA_ROOT) / 'products'
        media_dir.mkdir(parents=True, exist_ok=True)
        file_path = media_dir / saved_filename

        with open(file_path, 'wb') as destination:
            destination.write(final_bytes)

        return f"{settings.MEDIA_URL}products/{saved_filename}"

    @classmethod
    def fetch_image_from_url(cls, url: str) -> str:
        """
        Fetch remote image over HTTP/HTTPS with timeout and size check, verify, and store locally.
        """
        try:
            req = urllib.request.Request(
                url,
                headers={
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) VeePowerCatalogImporter/1.0',
                    'Accept': 'image/jpeg,image/png,image/webp,image/*;q=0.9',
                }
            )
            with urllib.request.urlopen(req, timeout=12) as response:
                content_type = response.headers.get('content-type', '').lower()
                data = response.read(cls.MAX_IMAGE_SIZE_BYTES + 1024)
                if len(data) > cls.MAX_IMAGE_SIZE_BYTES:
                    raise ValidationError(f"Remote image at '{url}' exceeds 5MB size limit.")
                return cls.save_image_bytes(data, original_filename=url)
        except ValidationError:
            raise
        except Exception as e:
            raise ValidationError(f"Failed to download image from URL '{url}': {str(e)}")

    @classmethod
    def resolve_image_source(
        cls,
        source: str,
        zip_ref: Optional[zipfile.ZipFile],
        zip_files_index: Dict[str, str]
    ) -> Optional[str]:
        """
        Resolve an image reference string:
        - Case A: Local filename matching inside uploaded images_zip.
        - Case B: HTTP/HTTPS remote URL.
        - Case C: Already a valid /media/ path.
        """
        if not source:
            return None

        clean_source = source.strip()
        if not clean_source:
            return None

        # Case C: Already local media URL
        if clean_source.startswith(settings.MEDIA_URL) or clean_source.startswith('/media/'):
            return clean_source

        # Case B: HTTP/HTTPS URL
        if clean_source.startswith('http://') or clean_source.startswith('https://'):
            return cls.fetch_image_from_url(clean_source)

        # Case A: Filename in ZIP
        lookup_name = Path(clean_source).name.lower()
        if zip_ref and lookup_name in zip_files_index:
            zip_internal_path = zip_files_index[lookup_name]
            image_bytes = zip_ref.read(zip_internal_path)
            return cls.save_image_bytes(image_bytes, original_filename=clean_source)

        if zip_ref:
            raise ValidationError(f"Image '{clean_source}' was not found inside the uploaded ZIP archive.")

        raise ValidationError(f"Image '{clean_source}' is not a valid URL, and no companion ZIP archive was provided.")

    @classmethod
    def parse_specifications(cls, raw_specs: str) -> List[Tuple[str, str]]:
        """
        Parse specifications string formatted with pipes '|', semicolons, or newlines.
        Example: "Poles: 1P | Current: 16A | Voltage: 240V"
        """
        if not raw_specs:
            return []

        specs: List[Tuple[str, str]] = []
        # Split by pipe, newline, or semicolon
        chunks = re.split(r'[\r\n|;]+', str(raw_specs))
        for chunk in chunks:
            chunk = chunk.strip()
            if not chunk:
                continue
            if ':' in chunk:
                k, v = chunk.split(':', 1)
            elif '=' in chunk:
                k, v = chunk.split('=', 1)
            else:
                continue
            k, v = k.strip(), v.strip()
            if k and v:
                specs.append((k[:100], v[:255]))
        return specs

    @classmethod
    def normalize_header(cls, header: str) -> str:
        """
        Normalize header names to snake_case without asterisks.
        e.g., 'SKU*' -> 'sku', 'Product_Name*' -> 'product_name', 'Price_INR*' -> 'price_inr'
        """
        if not header:
            return ''
        h = str(header).strip().lower()
        h = h.rstrip('*').strip()
        h = re.sub(r'[\s\-]+', '_', h)
        return h

    @classmethod
    def process_bulk_import(
        cls,
        excel_file,
        images_zip=None
    ) -> Dict[str, Any]:
        """
        Core bulk product import handler:
        - Parses Excel (.xlsx/.xls/.csv)
        - Pre-indexes optional companion ZIP archive
        - Validates rows inside per-row atomic transaction
        - Upserts products and handles categories, brands, images, and specifications
        """
        # Step 1: Prepare ZIP index if provided
        zip_ref: Optional[zipfile.ZipFile] = None
        zip_files_index: Dict[str, str] = {}

        if images_zip:
            try:
                zip_ref = zipfile.ZipFile(images_zip)
                for member in zip_ref.namelist():
                    p = Path(member)
                    # Ignore __MACOSX, directories, and hidden dot files
                    if '__macosx' in member.lower() or p.name.startswith('.') or member.endswith('/'):
                        continue
                    if p.name:
                        zip_files_index[p.name.lower()] = member
            except zipfile.BadZipFile:
                return {
                    "success": False,
                    "detail": "Uploaded image archive is not a valid ZIP file.",
                    "total_processed": 0,
                    "created_count": 0,
                    "updated_count": 0,
                    "error_count": 1,
                    "created": 0,
                    "updated": 0,
                    "errors": [{"row": 0, "sku": "ZIP", "reason": "Invalid or corrupted ZIP archive."}],
                }

        # Step 2: Read Excel/CSV rows
        raw_rows: List[Dict[str, Any]] = []
        embedded_images_by_row: Dict[int, List[Any]] = {}
        is_csv = getattr(excel_file, 'name', '').lower().endswith('.csv')

        try:
            if is_csv:
                import csv
                content = excel_file.read()
                if isinstance(content, bytes):
                    content = content.decode('utf-8-sig', errors='replace')
                reader = csv.reader(io.StringIO(content))
                header_row = next(reader, None)
                if header_row:
                    headers = [cls.normalize_header(h) for h in header_row]
                    for csv_idx, row in enumerate(reader, start=2):
                        if not any(row):
                            continue
                        row_dict = {'__row_num__': csv_idx}
                        for idx, val in enumerate(row):
                            if idx < len(headers) and headers[idx]:
                                row_dict[headers[idx]] = val
                        raw_rows.append(row_dict)
            else:
                wb = openpyxl.load_workbook(excel_file, data_only=True)
                # Prefer 'Products_Import' sheet if present, else active sheet
                ws = wb['Products_Import'] if 'Products_Import' in wb.sheetnames else wb.active

                # Extract embedded images and map by 1-based row index
                for img in getattr(ws, '_images', []):
                    r_num = cls.get_image_row(img)
                    if r_num:
                        embedded_images_by_row.setdefault(r_num, []).append(img)

                header_row = [cell.value for cell in ws[1]]
                headers = [cls.normalize_header(h) for h in header_row if h is not None]

                for row_cells in ws.iter_rows(min_row=2):
                    row_idx_actual = row_cells[0].row
                    row_values = [cell.value for cell in row_cells]
                    # Check if entire row is empty
                    if not any(val is not None and str(val).strip() != '' for val in row_values):
                        continue
                    row_dict = {'__row_num__': row_idx_actual}
                    for idx, val in enumerate(row_values):
                        if idx < len(headers) and headers[idx]:
                            row_dict[headers[idx]] = val
                    raw_rows.append(row_dict)

        except Exception as e:
            if zip_ref:
                zip_ref.close()
            return {
                "success": False,
                "detail": f"Failed to parse uploaded Excel/CSV file: {str(e)}",
                "total_processed": 0,
                "created_count": 0,
                "updated_count": 0,
                "error_count": 1,
                "created": 0,
                "updated": 0,
                "errors": [{"row": 1, "sku": "FILE", "reason": f"File parsing error: {str(e)}"}],
            }

        if not raw_rows:
            if zip_ref:
                zip_ref.close()
            return {
                "success": True,
                "detail": "No product records found in file.",
                "total_processed": 0,
                "created_count": 0,
                "updated_count": 0,
                "error_count": 0,
                "created": 0,
                "updated": 0,
                "errors": [],
            }

        # Step 3: Validate and process rows with per-row atomic transaction
        total_processed = 0
        created_count = 0
        updated_count = 0
        images_extracted_count = 0
        errors: List[Dict[str, Any]] = []

        try:
            for fallback_idx, row in enumerate(raw_rows, start=2):
                row_idx = row.get('__row_num__', fallback_idx)
                total_processed += 1
                sku_val = str(row.get('sku') or '').strip().upper()
                name_val = str(row.get('product_name') or row.get('name') or '').strip()

                try:
                    with transaction.atomic():
                        # Mandatory Field Checks
                        if not sku_val:
                            raise ValidationError("SKU is required.")
                        if not name_val:
                            raise ValidationError("Product_Name is required.")

                        category_name = str(row.get('category') or '').strip()
                        if not category_name:
                            raise ValidationError("Category is required.")

                        # Price validation
                        price_inr_raw = row.get('price_inr') or row.get('mrp') or row.get('price')
                        if price_inr_raw is None or str(price_inr_raw).strip() == '':
                            raise ValidationError("Price_INR (MRP) is required.")
                        try:
                            price_inr = Decimal(str(price_inr_raw).strip())
                            if price_inr < 0:
                                raise ValidationError("Price_INR cannot be negative.")
                        except (InvalidOperation, ValueError):
                            raise ValidationError(f"Invalid Price_INR value: '{price_inr_raw}'.")

                        # Discount price validation
                        discount_price_raw = row.get('discount_price_inr') or row.get('discount_price')
                        discount_price: Optional[Decimal] = None
                        if discount_price_raw is not None and str(discount_price_raw).strip() != '':
                            try:
                                discount_price = Decimal(str(discount_price_raw).strip())
                                if discount_price < 0:
                                    raise ValidationError("Discount_Price_INR cannot be negative.")
                                if discount_price > price_inr:
                                    raise ValidationError(f"Discount_Price_INR (₹{discount_price}) cannot exceed Price_INR (₹{price_inr}).")
                            except (InvalidOperation, ValueError):
                                raise ValidationError(f"Invalid Discount_Price_INR value: '{discount_price_raw}'.")

                        # Stock validation
                        stock_raw = row.get('stock_qty') or row.get('stock')
                        if stock_raw is None or str(stock_raw).strip() == '':
                            raise ValidationError("Stock_Qty is required.")
                        try:
                            stock_qty = int(float(str(stock_raw).strip()))
                            if stock_qty < 0:
                                raise ValidationError("Stock_Qty cannot be negative.")
                        except (ValueError, TypeError):
                            raise ValidationError(f"Invalid Stock_Qty value: '{stock_raw}'. Must be an integer.")

                        # GST Percentage validation
                        gst_raw = row.get('gst_percent') or row.get('gst')
                        if gst_raw is None or str(gst_raw).strip() == '':
                            raise ValidationError("GST_Percent is required.")
                        try:
                            clean_gst_str = str(gst_raw).replace('%', '').strip()
                            gst_val = int(float(clean_gst_str))
                            if gst_val not in cls.VALID_GST_RATES:
                                raise ValidationError(f"Invalid GST_Percent '{gst_raw}'. Allowed rates are: 0, 5, 12, 18, 28.")
                        except (ValueError, TypeError):
                            raise ValidationError(f"Invalid GST_Percent '{gst_raw}'. Must be 0, 5, 12, 18, or 28.")

                        # Brand lookup / fallback
                        brand_name = str(row.get('brand') or '').strip()
                        if not brand_name:
                            brand_name = "Vee Power"
                        brand_obj = Brand.objects.filter(name__iexact=brand_name).first()
                        if not brand_obj:
                            brand_slug = slugify(brand_name) or "brand"
                            counter = 1
                            base_slug = brand_slug
                            while Brand.objects.filter(slug=brand_slug).exists():
                                brand_slug = f"{base_slug}-{counter}"
                                counter += 1
                            brand_obj = Brand.objects.create(name=brand_name, slug=brand_slug, is_active=True)

                        # Category lookup / auto-match / create
                        category_obj = Category.objects.filter(name__iexact=category_name).first()
                        if not category_obj:
                            cat_slug = slugify(category_name) or "category"
                            counter = 1
                            base_slug = cat_slug
                            while Category.objects.filter(slug=cat_slug).exists():
                                cat_slug = f"{base_slug}-{counter}"
                                counter += 1
                            category_obj = Category.objects.create(name=category_name, slug=cat_slug, is_active=True)

                        # Description
                        description_val = str(row.get('description') or '').strip()

                        # Active status
                        active_raw = str(row.get('is_active', '')).strip().lower()
                        is_active = active_raw in ('true', '1', 'yes', 'y', 'active') if active_raw else True

                        # Selling price vs MRP
                        if discount_price is not None and discount_price > 0:
                            selling_price = discount_price
                            mrp_price = price_inr
                        else:
                            selling_price = price_inr
                            mrp_price = price_inr

                        # Find existing product for upsert
                        product = Product.objects.filter(sku=sku_val).first()
                        is_update = product is not None

                        if not product:
                            product = Product(sku=sku_val)

                        product.name = name_val
                        product.category = category_obj
                        product.brand = brand_obj
                        product.mrp = mrp_price
                        product.price = selling_price
                        product.stock = stock_qty
                        if description_val:
                            product.description = description_val
                        product.active = is_active
                        product._skip_indexnow = True  # Batch indexnow later
                        product.save()

                        # Image Handling: Priority 1: Embedded image directly in Excel on this row
                        primary_img_url = None
                        extra_gallery_urls: List[str] = []

                        embedded_imgs = embedded_images_by_row.get(row_idx, [])
                        for emb_idx, emb_img in enumerate(embedded_imgs):
                            try:
                                img_data_fn = getattr(emb_img, '_data', None)
                                if callable(img_data_fn):
                                    raw_img_data = img_data_fn()
                                elif isinstance(img_data_fn, (bytes, bytearray)):
                                    raw_img_data = bytes(img_data_fn)
                                else:
                                    continue

                                saved_url = cls.save_image_bytes(
                                    raw_img_data,
                                    original_filename=f"{sku_val or 'prod'}_row{row_idx}_{emb_idx}.png"
                                )
                                if emb_idx == 0:
                                    primary_img_url = saved_url
                                    images_extracted_count += 1
                                else:
                                    extra_gallery_urls.append(saved_url)
                            except Exception as emb_err:
                                raise ValidationError(f"Failed to process embedded image on row {row_idx}: {str(emb_err)}")

                        # Priority 2: If no embedded image on row, check Image_Source / URL / ZIP
                        if not primary_img_url:
                            image_source_raw = str(row.get('image_source') or row.get('primary_image') or row.get('image_url') or '').strip()
                            if image_source_raw:
                                primary_img_url = cls.resolve_image_source(image_source_raw, zip_ref, zip_files_index)
                                if primary_img_url and (image_source_raw.startswith('http://') or image_source_raw.startswith('https://')):
                                    images_extracted_count += 1

                        if primary_img_url:
                            # Update product primary image
                            ProductImage.objects.filter(product=product).update(is_primary=False)
                            ProductImage.objects.create(
                                product=product,
                                image_url=primary_img_url,
                                is_primary=True,
                                sort_order=0
                            )
                            product.primary_image = primary_img_url
                            product.save(update_fields=['primary_image'])
                        elif not is_update and not product.primary_image:
                            raise ValidationError("Image_Source (embedded image or image URL) is required for new products.")

                        # Gallery Images Handling: Any extra embedded images + gallery_images column
                        all_gallery_urls = list(extra_gallery_urls)
                        gallery_raw = str(row.get('gallery_images') or '').strip()
                        if gallery_raw:
                            gallery_items = [g.strip() for g in re.split(r'[,|]+', gallery_raw) if g.strip()]
                            for g_item in gallery_items:
                                g_url = cls.resolve_image_source(g_item, zip_ref, zip_files_index)
                                if g_url:
                                    all_gallery_urls.append(g_url)

                        for g_idx, g_url in enumerate(all_gallery_urls, start=1):
                            ProductImage.objects.create(
                                product=product,
                                image_url=g_url,
                                is_primary=False,
                                sort_order=g_idx
                            )

                        # Specifications Handling
                        specs_raw = str(row.get('specifications') or '').strip()
                        parsed_specs = cls.parse_specifications(specs_raw)
                        for s_order, (s_key, s_val) in enumerate(parsed_specs, start=1):
                            ProductSpecification.objects.update_or_create(
                                product=product,
                                spec_key=s_key,
                                defaults={'spec_value': s_val, 'sort_order': s_order}
                            )

                        # Save GST Rate specification
                        ProductSpecification.objects.update_or_create(
                            product=product,
                            spec_key="GST Rate",
                            defaults={'spec_value': f"{gst_val}%", 'sort_order': 98}
                        )

                        # Unit specification if provided
                        unit_val = str(row.get('unit') or '').strip()
                        if unit_val:
                            ProductSpecification.objects.update_or_create(
                                product=product,
                                spec_key="Unit",
                                defaults={'spec_value': unit_val, 'sort_order': 99}
                            )

                        if is_update:
                            updated_count += 1
                        else:
                            created_count += 1

                except Exception as row_err:
                    error_msg = str(row_err)
                    if hasattr(row_err, 'message_dict'):
                        error_msg = "; ".join(f"{k}: {', '.join(v)}" for k, v in row_err.message_dict.items())
                    elif hasattr(row_err, 'messages'):
                        error_msg = "; ".join(row_err.messages)

                    errors.append({
                        "row": row_idx,
                        "sku": sku_val or "N/A",
                        "reason": error_msg,
                        "error": error_msg,
                    })

        finally:
            if zip_ref:
                zip_ref.close()

        # Invalidate caches once after import
        invalidate_catalog_cache()
        invalidate_brands_cache()

        return {
            "success": True,
            "total_processed": total_processed,
            "created_count": created_count,
            "updated_count": updated_count,
            "images_extracted": images_extracted_count,
            "images_extracted_count": images_extracted_count,
            "error_count": len(errors),
            "created": created_count,
            "updated": updated_count,
            "errors": errors,
        }
