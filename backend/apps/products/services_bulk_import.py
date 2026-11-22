import io
import os
import re
import uuid
import zipfile
import urllib.request
import urllib.error
import xml.etree.ElementTree as ET
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
from openpyxl.worksheet.datavalidation import DataValidation

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
    bulk product imports (upsert) with embedded in-cell / floating images and URL resolution.
    """

    TEMPLATE_COLUMNS = [
        ('SKU*', 18, 'Unique Stock Keeping Unit (e.g., SCH-MCB-1P-16A)'),
        ('Product_Name*', 35, 'Full product title (e.g., Schneider Acti9 1P 16A C-Curve MCB)'),
        ('Category*', 22, 'Select from dropdown (e.g., MCB & Protection, Wires & Cables)'),
        ('Brand', 18, 'Select from dropdown or enter brand (e.g., Schneider, Havells, Polycab)'),
        ('Price_INR*', 15, 'Base MRP price in INR (e.g., 280.00)'),
        ('Discount_Price_INR', 20, 'Discounted selling price in INR (must be <= Price_INR)'),
        ('Stock_Qty*', 14, 'Available stock inventory quantity (integer >= 0)'),
        ('GST_Percent*', 14, 'Applicable GST percentage: 0, 5, 12, 18, or 28'),
        ('Unit', 14, 'Unit of measure (e.g., Piece, Meter, Coil, Box, Set)'),
        ('Description', 40, 'Detailed product description and features'),
        ('Specifications', 40, 'Key-value specs separated by pipe (e.g., Poles: 1P | Current: 16A)'),
        ('Image_Source*', 28, 'Insert/Paste image directly into cell OR provide https:// URL'),
        ('Gallery_Images', 32, 'Additional image URLs separated by comma or pipe'),
        ('Is_Active', 12, 'TRUE or FALSE (default TRUE)'),
    ]

    VALID_GST_RATES = {0, 5, 12, 18, 28}
    ALLOWED_IMAGE_EXTENSIONS = {'JPEG': 'jpg', 'PNG': 'png', 'WEBP': 'webp'}
    MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB

    @classmethod
    def generate_template_workbook(cls) -> io.BytesIO:
        """
        Generate a styled, production-ready Excel workbook (.xlsx) with:
        1. Products_Import worksheet with formatted headers, sample rows, and dropdown DataValidation.
        2. Instructions worksheet with field rules and GST rates.
        3. Hidden _Lists reference worksheet populated with active Category & Brand names from database.
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

        # Sample Rows: Image_Source* and Gallery_Images are intentionally left blank (empty string)
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
                "",
                "",
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
                "",
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
                "",
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

        # Sheet 2: Hidden Reference Sheet _Lists for Dropdown Data Validation
        ws_lists = wb.create_sheet(title="_Lists")
        ws_lists.sheet_state = "hidden"

        # Query active categories
        cat_names: List[str] = []
        try:
            cat_names = list(Category.objects.filter(is_active=True).values_list('name', flat=True).order_by('name'))
        except Exception:
            pass
        if not cat_names:
            cat_names = ['MCB & Protection', 'Wires & Cables', 'Lighting', 'Switches & Sockets', 'Industrial']

        # Query active brands
        brand_names: List[str] = []
        try:
            brand_names = list(Brand.objects.filter(is_active=True).values_list('name', flat=True).order_by('name'))
            if not brand_names:
                distinct_brands = list(Product.objects.filter(active=True).values_list('brand__name', flat=True).distinct())
                brand_names = sorted(list({b for b in distinct_brands if b}))
        except Exception:
            pass
        if not brand_names:
            brand_names = ['Schneider', 'Havells', 'Polycab', 'Philips', 'Legrand', 'Vee Power']

        # Populate Column A: Categories
        ws_lists.cell(row=1, column=1, value="Categories")
        for c_idx, c_name in enumerate(cat_names, start=2):
            ws_lists.cell(row=c_idx, column=1, value=c_name)

        # Populate Column B: Brands
        ws_lists.cell(row=1, column=2, value="Brands")
        for b_idx, b_name in enumerate(brand_names, start=2):
            ws_lists.cell(row=b_idx, column=2, value=b_name)

        # Attach DataValidation Dropdowns on Products_Import sheet
        cat_max_row = max(len(cat_names) + 1, 2)
        dv_cat = DataValidation(
            type="list",
            formula1=f"=_Lists!$A$2:$A${cat_max_row}",
            allow_blank=False,
            errorStyle="stop",
            errorTitle="Invalid Category",
            error="Please select an existing category from the dropdown."
        )
        ws_import.add_data_validation(dv_cat)
        dv_cat.add("C2:C500")

        brand_max_row = max(len(brand_names) + 1, 2)
        dv_brand = DataValidation(
            type="list",
            formula1=f"=_Lists!$B$2:$B${brand_max_row}",
            allow_blank=True,
            errorStyle="stop",
            errorTitle="Invalid Brand",
            error="Please select an existing brand from the dropdown or enter a brand name."
        )
        ws_import.add_data_validation(dv_brand)
        dv_brand.add("D2:D500")

        # Sheet 3: Instructions & Guidelines
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
            ("Category*", "YES", "Dropdown List", "Select category from dropdown list (synced from live store database)."),
            ("Brand", "NO", "Dropdown List", "Select brand from dropdown list or enter custom brand (defaults to 'Vee Power')."),
            ("Price_INR*", "YES", "Number (Decimal)", "Maximum Retail Price (MRP) in INR. Must be > 0."),
            ("Discount_Price_INR", "NO", "Number (Decimal)", "Discounted selling price. Must be less than or equal to Price_INR."),
            ("Stock_Qty*", "YES", "Integer", "Available inventory quantity. Must be >= 0."),
            ("GST_Percent*", "YES", "Number", "Standard Indian GST slab: 0, 5, 12, 18, or 28."),
            ("Unit", "NO", "Text", "Unit of measurement (e.g. Piece, Meter, Coil, Box, Set)."),
            ("Description", "NO", "Text", "Full marketing/technical description of the product."),
            ("Specifications", "NO", "Key: Value pairs", "Technical specs separated by pipe '|' (e.g. Poles: 1P | Current: 16A)."),
            ("Image_Source*", "YES (for new)", "Embedded Image / URL", "Insert/paste image directly into cell OR paste an https:// image URL."),
            ("Gallery_Images", "NO", "URLs", "Additional image URLs separated by comma or pipe."),
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
    def extract_all_excel_images(
        cls,
        excel_file_bytes: bytes,
        ws=None
    ) -> Tuple[Dict[str, bytes], Dict[int, List[bytes]]]:
        """
        Extract embedded images from BOTH:
        1. OpenPyXL worksheet drawings (ws._images, 'Place Over Cells').
        2. Excel ZIP package rich data and cellimages ('Place in Cell', where cells read #VALUE!).
        Returns:
            images_by_cell: Dict[str, bytes] mapping coordinate e.g. 'L2' to image bytes.
            images_by_row: Dict[int, List[bytes]] mapping 1-based row number e.g. 2 to list of image bytes.
        """
        images_by_cell: Dict[str, bytes] = {}
        images_by_row: Dict[int, List[bytes]] = {}

        # Source 1: OpenPyXL floating drawings (Place Over Cells)
        if ws is not None:
            for img in getattr(ws, '_images', []):
                r_num = cls.get_image_row(img)
                img_data = None
                img_data_fn = getattr(img, '_data', None)
                if callable(img_data_fn):
                    img_data = img_data_fn()
                elif isinstance(img_data_fn, (bytes, bytearray)):
                    img_data = bytes(img_data_fn)

                if img_data and r_num:
                    images_by_row.setdefault(r_num, []).append(img_data)
                    # Associate default image column L with this row
                    cell_coord = f"L{r_num}"
                    if cell_coord not in images_by_cell:
                        images_by_cell[cell_coord] = img_data

        # Source 2: Direct ZIP inspection for "Place in Cell" rich data / cellimages
        if not excel_file_bytes:
            return images_by_cell, images_by_row

        try:
            zf = zipfile.ZipFile(io.BytesIO(excel_file_bytes))
        except Exception:
            return images_by_cell, images_by_row

        namelist = zf.namelist()

        # Modern Microsoft 365 Rich Value Media (xl/richData/)
        if 'xl/metadata.xml' in namelist and 'xl/richData/rdrichvalue.xml' in namelist:
            try:
                # Map rId -> ZIP target path (e.g. 'rId1' -> 'xl/media/image1.png')
                rel_to_target: Dict[str, str] = {}
                rels_path = 'xl/richData/_rels/richValueRel.xml.rels'
                if rels_path in namelist:
                    root = ET.fromstring(zf.read(rels_path))
                    for el in root:
                        r_id = el.attrib.get('Id')
                        target = el.attrib.get('Target', '')
                        if r_id and target:
                            clean_path = target.replace('../', 'xl/')
                            if not clean_path.startswith('xl/'):
                                clean_path = 'xl/' + clean_path.lstrip('/')
                            rel_to_target[r_id] = clean_path

                # Map rel index -> rId
                idx_to_rid: List[str] = []
                rvrel_path = 'xl/richData/richValueRel.xml'
                if rvrel_path in namelist:
                    root = ET.fromstring(zf.read(rvrel_path))
                    for el in root:
                        r_id = None
                        for k, v in el.attrib.items():
                            if k.endswith('id') or k == 'r:id':
                                r_id = v
                                break
                        if r_id:
                            idx_to_rid.append(r_id)

                # Map rv index -> rel index
                rv_to_rel_idx: List[int] = []
                rv_path = 'xl/richData/rdrichvalue.xml'
                if rv_path in namelist:
                    root = ET.fromstring(zf.read(rv_path))
                    for rv in root:
                        v_elem = None
                        for child in rv:
                            if child.tag.endswith('v'):
                                v_elem = child
                                break
                        if v_elem is not None and v_elem.text:
                            try:
                                rv_to_rel_idx.append(int(v_elem.text))
                            except ValueError:
                                rv_to_rel_idx.append(-1)
                        else:
                            rv_to_rel_idx.append(-1)

                # Map vm index (1-based) -> rv index
                vm_to_rv_idx: Dict[int, int] = {}
                meta_path = 'xl/metadata.xml'
                if meta_path in namelist:
                    root = ET.fromstring(zf.read(meta_path))
                    vm_counter = 1
                    for bk in root.iter():
                        if bk.tag.endswith('bk'):
                            rc_elem = None
                            for child in bk:
                                if child.tag.endswith('rc'):
                                    rc_elem = child
                                    break
                            if rc_elem is not None:
                                v_val = rc_elem.attrib.get('v')
                                if v_val is not None:
                                    try:
                                        vm_to_rv_idx[vm_counter] = int(v_val)
                                    except ValueError:
                                        pass
                            vm_counter += 1

                # Map cell coordinate from sheet XMLs
                sheet_files = [f for f in namelist if f.startswith('xl/worksheets/sheet') and f.endswith('.xml')]
                for sf in sheet_files:
                    root = ET.fromstring(zf.read(sf))
                    for c in root.iter():
                        if c.tag.endswith('c'):
                            cell_coord = c.attrib.get('r')
                            vm_val = c.attrib.get('vm')
                            if cell_coord and vm_val:
                                try:
                                    vm_idx = int(vm_val)
                                    if vm_idx in vm_to_rv_idx:
                                        rv_idx = vm_to_rv_idx[vm_idx]
                                        if 0 <= rv_idx < len(rv_to_rel_idx):
                                            rel_idx = rv_to_rel_idx[rv_idx]
                                            if 0 <= rel_idx < len(idx_to_rid):
                                                r_id = idx_to_rid[rel_idx]
                                                if r_id in rel_to_target:
                                                    target_path = rel_to_target[r_id]
                                                    if target_path in namelist:
                                                        img_bytes = zf.read(target_path)
                                                        images_by_cell[cell_coord] = img_bytes
                                                        m_row = re.search(r'\d+', cell_coord)
                                                        if m_row:
                                                            r_num = int(m_row.group(0))
                                                            if img_bytes not in images_by_row.get(r_num, []):
                                                                images_by_row.setdefault(r_num, []).append(img_bytes)
                                except Exception:
                                    pass
            except Exception:
                pass

        # WPS / cellimages.xml format (=DISPIMG)
        if 'xl/cellimages.xml' in namelist:
            try:
                rel_to_target = {}
                ci_rels = 'xl/_rels/cellimages.xml.rels'
                if ci_rels in namelist:
                    root = ET.fromstring(zf.read(ci_rels))
                    for el in root:
                        r_id = el.attrib.get('Id')
                        target = el.attrib.get('Target', '')
                        if r_id and target:
                            clean_path = target.replace('../', 'xl/')
                            if not clean_path.startswith('xl/'):
                                clean_path = 'xl/' + clean_path.lstrip('/')
                            rel_to_target[r_id] = clean_path

                ci_root = ET.fromstring(zf.read('xl/cellimages.xml'))
                name_to_target: Dict[str, str] = {}
                for pic in ci_root.iter():
                    if pic.tag.endswith('pic'):
                        pic_name = None
                        embed_id = None
                        for el in pic.iter():
                            if el.tag.endswith('cNvPr'):
                                pic_name = el.attrib.get('name')
                            elif el.tag.endswith('blip'):
                                for k, v in el.attrib.items():
                                    if k.endswith('embed'):
                                        embed_id = v
                                        break
                        if pic_name and embed_id and embed_id in rel_to_target:
                            name_to_target[pic_name] = rel_to_target[embed_id]

                sheet_files = [f for f in namelist if f.startswith('xl/worksheets/sheet') and f.endswith('.xml')]
                for sf in sheet_files:
                    root = ET.fromstring(zf.read(sf))
                    for c in root.iter():
                        if c.tag.endswith('c'):
                            cell_coord = c.attrib.get('r')
                            f_text = ""
                            for child in c:
                                if child.tag.endswith('f') and child.text:
                                    f_text = child.text
                                    break
                            if cell_coord and f_text and 'DISPIMG' in f_text:
                                m_id = re.search(r'DISPIMG\("([^"]+)"', f_text)
                                if m_id:
                                    img_id = m_id.group(1)
                                    if img_id in name_to_target:
                                        tpath = name_to_target[img_id]
                                        if tpath in namelist:
                                            img_bytes = zf.read(tpath)
                                            images_by_cell[cell_coord] = img_bytes
                                            m_row = re.search(r'\d+', cell_coord)
                                            if m_row:
                                                r_num = int(m_row.group(0))
                                                if img_bytes not in images_by_row.get(r_num, []):
                                                    images_by_row.setdefault(r_num, []).append(img_bytes)
            except Exception:
                pass

        return images_by_cell, images_by_row

    @classmethod
    def save_image_bytes(cls, image_bytes: bytes, original_filename: str = "") -> str:
        """
        Validate image bytes using Pillow, convert non-standard formats to PNG,
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

        # Ignore excel formula or error strings
        if clean_source.upper() in ('#VALUE!', '#VALUE') or clean_source.upper().startswith('=DISPIMG') or clean_source.upper().startswith('DISPIMG'):
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

        raise ValidationError("No embedded image or valid https:// URL found in this row.")

    @classmethod
    def parse_specifications(cls, raw_specs: str) -> List[Tuple[str, str]]:
        """
        Parse specifications string formatted with pipes '|', semicolons, or newlines.
        Example: "Poles: 1P | Current: 16A | Voltage: 240V"
        """
        if not raw_specs:
            return []

        specs: List[Tuple[str, str]] = []
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
        - Extracts embedded images from both floating drawings and 'Place in Cell' rich data
        - Matches categories and brands case-insensitively
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

        # Step 2: Read Excel/CSV rows and extract all images
        raw_rows: List[Dict[str, Any]] = []
        images_by_cell: Dict[str, bytes] = {}
        images_by_row: Dict[int, List[bytes]] = {}
        is_csv = getattr(excel_file, 'name', '').lower().endswith('.csv')

        try:
            # Buffer file bytes for both openpyxl and direct ZIP extraction
            if hasattr(excel_file, 'read'):
                file_bytes = excel_file.read()
                if hasattr(excel_file, 'seek'):
                    excel_file.seek(0)
            else:
                file_bytes = bytes(excel_file)

            if is_csv:
                import csv
                content = file_bytes.decode('utf-8-sig', errors='replace')
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
                wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)
                ws = wb['Products_Import'] if 'Products_Import' in wb.sheetnames else wb.active

                # Extract embedded images from drawings AND rich data / cellimages
                images_by_cell, images_by_row = cls.extract_all_excel_images(file_bytes, ws)

                header_row = [cell.value for cell in ws[1]]
                headers = [cls.normalize_header(h) for h in header_row if h is not None]

                for row_cells in ws.iter_rows(min_row=2):
                    row_idx_actual = row_cells[0].row
                    row_values = [cell.value for cell in row_cells]
                    if not any(val is not None and str(val).strip() != '' for val in row_values):
                        continue
                    row_dict = {'__row_num__': row_idx_actual}
                    for idx, val in enumerate(row_values):
                        if idx < len(headers) and headers[idx]:
                            # Filter out Excel error strings like #VALUE! or formulas like =DISPIMG(...)
                            val_str = str(val).strip() if val is not None else ""
                            if val_str.upper() in ('#VALUE!', '#VALUE') or val_str.upper().startswith('=DISPIMG') or val_str.upper().startswith('DISPIMG'):
                                val = ""
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

                        # Brand lookup / fallback (case-insensitive exact match)
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

                        # Category lookup / auto-match / create (case-insensitive exact match)
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
                        product._skip_indexnow = True
                        product.save()

                        # Image Handling: Priority 1: Extracted in-cell / floating images for this row
                        primary_img_url = None
                        extra_gallery_urls: List[str] = []

                        row_cell_coord = f"L{row_idx}"
                        row_images: List[bytes] = []
                        if row_cell_coord in images_by_cell:
                            row_images.append(images_by_cell[row_cell_coord])
                        if row_idx in images_by_row:
                            for r_img in images_by_row[row_idx]:
                                if r_img not in row_images:
                                    row_images.append(r_img)

                        for emb_idx, raw_img_data in enumerate(row_images):
                            try:
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

                        # Priority 2: If no embedded image on row, check Image_Source column (URL or ZIP)
                        if not primary_img_url:
                            image_source_raw = str(row.get('image_source') or row.get('primary_image') or row.get('image_url') or '').strip()
                            if image_source_raw.upper() in ('#VALUE!', '#VALUE') or image_source_raw.upper().startswith('=DISPIMG') or image_source_raw.upper().startswith('DISPIMG'):
                                image_source_raw = ""

                            if image_source_raw:
                                primary_img_url = cls.resolve_image_source(image_source_raw, zip_ref, zip_files_index)
                                if primary_img_url and (image_source_raw.startswith('http://') or image_source_raw.startswith('https://')):
                                    images_extracted_count += 1

                        if primary_img_url:
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
                            raise ValidationError("No embedded image or valid https:// URL found in this row.")

                        # Gallery Images Handling
                        all_gallery_urls = list(extra_gallery_urls)
                        gallery_raw = str(row.get('gallery_images') or '').strip()
                        if gallery_raw.upper() in ('#VALUE!', '#VALUE') or gallery_raw.upper().startswith('=DISPIMG'):
                            gallery_raw = ""

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
