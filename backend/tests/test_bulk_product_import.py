import io
import zipfile
from decimal import Decimal
from PIL import Image
import openpyxl

from django.test import TestCase
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient
from rest_framework import status

from apps.users.models import User, UserRole
from apps.products.models import Category, Brand, Product, ProductImage, ProductSpecification
from apps.products.services_bulk_import import BulkProductImportService


class BulkProductImportTests(TestCase):
    """
    Comprehensive tests for the Excel & ZIP Bulk Product Import:
    1. Template generation and header verification (all 14 required columns)
    2. Role-based access control for template and import endpoints
    3. Bulk product creation with auto-category and auto-brand creation
    4. Upsert by SKU (updating existing products)
    5. Companion ZIP image extraction and gallery association
    6. Row-level transaction isolation (valid rows succeed while faulty rows report errors)
    7. Validation errors for invalid GST slabs, negative prices, and discount > MRP
    """

    def setUp(self):
        self.client = APIClient()

        self.admin = User.objects.create_user(
            username='admin_bulk_test',
            email='admin_bulk@veepower.com',
            password='AdminPassword123!',
            role=UserRole.ADMIN,
            is_staff=True,
        )

        self.customer = User.objects.create_user(
            username='cust_bulk_test',
            email='cust_bulk@veepower.com',
            password='CustomerPassword123!',
            role=UserRole.CUSTOMER,
        )

        self.category = Category.objects.create(
            name='MCB & Protection',
            slug='mcb-protection',
            is_active=True,
        )

        self.brand = Brand.objects.create(
            name='Schneider',
            slug='schneider',
            is_active=True,
        )

    def _create_dummy_image_bytes(self, fmt='JPEG', size=(50, 50), color=(0, 128, 255)):
        bio = io.BytesIO()
        img = Image.new('RGB', size, color)
        img.save(bio, format=fmt)
        return bio.getvalue()

    def _build_excel_file(self, rows):
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Products_Import"
        headers = [col[0] for col in BulkProductImportService.TEMPLATE_COLUMNS]
        ws.append(headers)
        for row in rows:
            ws.append(row)
        bio = io.BytesIO()
        wb.save(bio)
        bio.seek(0)
        return bio.getvalue()

    def _build_zip_archive(self, file_dict):
        bio = io.BytesIO()
        with zipfile.ZipFile(bio, 'w', zipfile.ZIP_DEFLATED) as zf:
            for fname, data in file_dict.items():
                zf.writestr(fname, data)
        bio.seek(0)
        return bio.getvalue()

    def test_01_template_generation_and_headers(self):
        """
        Verify template workbook contains both sheets and exact 14 columns.
        """
        buffer = BulkProductImportService.generate_template_workbook()
        wb = openpyxl.load_workbook(buffer, data_only=True)
        self.assertIn("Products_Import", wb.sheetnames)
        self.assertIn("Instructions", wb.sheetnames)

        ws = wb["Products_Import"]
        headers = [cell.value for cell in ws[1] if cell.value is not None]
        expected_headers = [
            'SKU*', 'Product_Name*', 'Category*', 'Brand', 'Price_INR*',
            'Discount_Price_INR', 'Stock_Qty*', 'GST_Percent*', 'Unit',
            'Description', 'Specifications', 'Image_Source*', 'Gallery_Images', 'Is_Active'
        ]
        self.assertEqual(headers, expected_headers)

    def test_02_template_endpoint_permissions(self):
        """
        Verify template download allows public/authenticated access (AllowAny)
        so template downloads never fail with 401, while bulk import upload requires admin authentication.
        """
        # Unauthenticated request for template download - must succeed with 200 OK
        res = self.client.get('/api/v1/catalog/products/bulk-import/template/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res['Content-Type'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        self.assertIn('VeePower_Products_Template.xlsx', res['Content-Disposition'])

        # Customer role request for template download - must also succeed with 200 OK
        self.client.force_authenticate(user=self.customer)
        res = self.client.get('/api/v1/catalog/products/bulk-import/template/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Admin user request for template download
        self.client.force_authenticate(user=self.admin)
        res = self.client.get('/api/v1/catalog/products/bulk-import/template/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('VeePower_Products_Template.xlsx', res['Content-Disposition'])

        # Verify alias route works identically
        res_alias = self.client.get('/api/admin/products/bulk-import/template/')
        self.assertEqual(res_alias.status_code, status.HTTP_200_OK)

        # Verify bulk import upload endpoint strictly requires IsAdminUser
        self.client.force_authenticate(user=None)
        res_unauth = self.client.post('/api/v1/catalog/products/bulk-import/', data={})
        self.assertEqual(res_unauth.status_code, status.HTTP_401_UNAUTHORIZED)

        self.client.force_authenticate(user=self.customer)
        res_cust = self.client.post('/api/v1/catalog/products/bulk-import/', data={})
        self.assertEqual(res_cust.status_code, status.HTTP_403_FORBIDDEN)

    def test_03_bulk_import_with_zip_images_and_upsert(self):
        """
        Test importing products from Excel with companion ZIP image files.
        Verifies product creation, category auto-creation, specification parsing,
        primary and gallery image linking, and subsequent upsert.
        """
        img1_bytes = self._create_dummy_image_bytes('JPEG', (60, 60))
        img2_bytes = self._create_dummy_image_bytes('PNG', (60, 60))
        zip_bytes = self._build_zip_archive({
            'schneider_16a.jpg': img1_bytes,
            'schneider_gallery1.png': img2_bytes,
        })

        excel_rows = [
            [
                "TEST-SCH-16A",
                "Schneider Acti9 16A MCB",
                "MCB & Protection",
                "Schneider",
                250.00,
                220.00,
                40,
                18,
                "Piece",
                "Miniature Circuit Breaker 16A",
                "Poles: 1P | Current: 16A | Voltage: 240V",
                "schneider_16a.jpg",
                "schneider_gallery1.png",
                "TRUE",
            ],
            [
                "TEST-POLY-2.5",
                "Polycab 2.5sq mm Wire",
                "Wires & Cables",  # New category, should auto-create
                "Polycab",        # New brand, should auto-create
                1800.00,
                "",               # No discount, selling price = MRP
                25,
                18,
                "Coil",
                "Copper building wire 90m",
                "Gauge: 2.5 | Length: 90m",
                "schneider_16a.jpg",
                "",
                "TRUE",
            ]
        ]
        excel_bytes = self._build_excel_file(excel_rows)

        self.client.force_authenticate(user=self.admin)
        res = self.client.post(
            '/api/v1/catalog/products/bulk-import/',
            data={
                'excel_file': SimpleUploadedFile('products.xlsx', excel_bytes, content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
                'images_zip': SimpleUploadedFile('images.zip', zip_bytes, content_type='application/zip'),
            },
            format='multipart'
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()
        self.assertTrue(data['success'])
        self.assertEqual(data['created_count'], 2)
        self.assertEqual(data['updated_count'], 0)
        self.assertEqual(data['error_count'], 0)

        # Verify created product 1
        p1 = Product.objects.get(sku="TEST-SCH-16A")
        self.assertEqual(p1.name, "Schneider Acti9 16A MCB")
        self.assertEqual(p1.mrp, Decimal("250.00"))
        self.assertEqual(p1.price, Decimal("220.00"))
        self.assertEqual(p1.stock, 40)
        self.assertTrue(p1.primary_image.startswith('/media/products/'))
        self.assertEqual(p1.images.count(), 2)

        # Verify specifications
        specs = {s.spec_key: s.spec_value for s in p1.specifications.all()}
        self.assertEqual(specs.get('Poles'), '1P')
        self.assertEqual(specs.get('Current'), '16A')
        self.assertEqual(specs.get('GST Rate'), '18%')
        self.assertEqual(specs.get('Unit'), 'Piece')

        # Verify auto-created category and brand for product 2
        p2 = Product.objects.get(sku="TEST-POLY-2.5")
        self.assertEqual(p2.category.name, "Wires & Cables")
        self.assertEqual(p2.brand.name, "Polycab")
        self.assertEqual(p2.mrp, Decimal("1800.00"))
        self.assertEqual(p2.price, Decimal("1800.00"))

        # Now test upsert: update stock and price of product 1
        excel_update_rows = [
            [
                "TEST-SCH-16A",
                "Schneider Acti9 16A MCB (Updated Edition)",
                "MCB & Protection",
                "Schneider",
                270.00,
                230.00,
                95,
                18,
                "Piece",
                "Updated description",
                "Poles: 1P | Current: 16A | Voltage: 240V",
                "schneider_16a.jpg",
                "",
                "TRUE",
            ]
        ]
        excel_update_bytes = self._build_excel_file(excel_update_rows)
        res_update = self.client.post(
            '/api/v1/catalog/products/bulk-import/',
            data={
                'excel_file': SimpleUploadedFile('products_update.xlsx', excel_update_bytes, content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
                'images_zip': SimpleUploadedFile('images.zip', zip_bytes, content_type='application/zip'),
            },
            format='multipart'
        )
        self.assertEqual(res_update.status_code, status.HTTP_200_OK)
        update_data = res_update.json()
        self.assertEqual(update_data['created_count'], 0)
        self.assertEqual(update_data['updated_count'], 1)

        p1.refresh_from_db()
        self.assertEqual(p1.name, "Schneider Acti9 16A MCB (Updated Edition)")
        self.assertEqual(p1.stock, 95)
        self.assertEqual(p1.price, Decimal("230.00"))
        self.assertEqual(p1.mrp, Decimal("270.00"))

    def test_04_row_level_isolation_and_error_reporting(self):
        """
        Verify valid rows succeed even when other rows fail (atomic isolation per row),
        and error messages identify the exact row and failure reason.
        """
        img_bytes = self._create_dummy_image_bytes('JPEG')
        zip_bytes = self._build_zip_archive({'valid_img.jpg': img_bytes})

        mixed_rows = [
            # Row 2 (Excel line 2): Valid
            [
                "SKU-VALID-1",
                "Valid Product 1",
                "MCB & Protection",
                "Schneider",
                100.00,
                90.00,
                10,
                18,
                "Piece",
                "Desc",
                "",
                "valid_img.jpg",
                "",
                "TRUE",
            ],
            # Row 3 (Excel line 3): Invalid GST rate (35% not allowed)
            [
                "SKU-BAD-GST",
                "Invalid GST Product",
                "MCB & Protection",
                "Schneider",
                100.00,
                90.00,
                10,
                35,  # Invalid GST
                "Piece",
                "Desc",
                "",
                "valid_img.jpg",
                "",
                "TRUE",
            ],
            # Row 4 (Excel line 4): Discount price higher than MRP
            [
                "SKU-BAD-PRICE",
                "Invalid Price Product",
                "MCB & Protection",
                "Schneider",
                100.00,
                150.00,  # Discount exceeds MRP
                10,
                18,
                "Piece",
                "Desc",
                "",
                "valid_img.jpg",
                "",
                "TRUE",
            ],
            # Row 5 (Excel line 5): Missing image in ZIP for new product
            [
                "SKU-MISSING-IMG",
                "Missing Image Product",
                "MCB & Protection",
                "Schneider",
                100.00,
                90.00,
                10,
                18,
                "Piece",
                "Desc",
                "",
                "non_existent.jpg",  # Not in ZIP
                "",
                "TRUE",
            ],
            # Row 6 (Excel line 6): Valid
            [
                "SKU-VALID-2",
                "Valid Product 2",
                "MCB & Protection",
                "Schneider",
                500.00,
                450.00,
                20,
                12,
                "Piece",
                "Desc",
                "",
                "valid_img.jpg",
                "",
                "TRUE",
            ]
        ]
        excel_bytes = self._build_excel_file(mixed_rows)

        self.client.force_authenticate(user=self.admin)
        res = self.client.post(
            '/api/v1/catalog/products/bulk-import/',
            data={
                'excel_file': SimpleUploadedFile('products_mixed.xlsx', excel_bytes, content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
                'images_zip': SimpleUploadedFile('images.zip', zip_bytes, content_type='application/zip'),
            },
            format='multipart'
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()
        self.assertEqual(data['total_processed'], 5)
        self.assertEqual(data['created_count'], 2)
        self.assertEqual(data['updated_count'], 0)
        self.assertEqual(data['error_count'], 3)

        # Valid rows must exist in DB
        self.assertTrue(Product.objects.filter(sku="SKU-VALID-1").exists())
        self.assertTrue(Product.objects.filter(sku="SKU-VALID-2").exists())

        # Failed rows must NOT exist in DB
        self.assertFalse(Product.objects.filter(sku="SKU-BAD-GST").exists())
        self.assertFalse(Product.objects.filter(sku="SKU-BAD-PRICE").exists())
        self.assertFalse(Product.objects.filter(sku="SKU-MISSING-IMG").exists())

        # Verify error rows and messages
        err_skus = [e['sku'] for e in data['errors']]
        self.assertIn("SKU-BAD-GST", err_skus)
        self.assertIn("SKU-BAD-PRICE", err_skus)
        self.assertIn("SKU-MISSING-IMG", err_skus)

    def test_08_bulk_import_with_embedded_excel_images(self):
        """
        Verify that images embedded directly inside the .xlsx spreadsheet are extracted
        and assigned to the corresponding product.
        """
        from openpyxl.drawing.image import Image as OpenpyxlImage

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Products_Import"
        headers = [col[0] for col in BulkProductImportService.TEMPLATE_COLUMNS]
        ws.append(headers)

        # Row 2 data: leave Image_Source empty because image is embedded in row 2
        row_data = [
            "EMBED-MCB-32A",
            "Havells 32A Double Pole MCB",
            "MCB & Protection",
            "Havells",
            650.00,
            580.00,
            25,
            18,
            "Piece",
            "Havells Double Pole 32A MCB with high breaking capacity",
            "Poles: 2P | Current: 32A",
            "",
            "",
            "TRUE",
        ]
        ws.append(row_data)

        # Embed an image at cell L2 (row 2, column 12)
        img_bytes = self._create_dummy_image_bytes('PNG', (80, 80), color=(0, 200, 100))
        img_bio = io.BytesIO(img_bytes)
        xl_img = OpenpyxlImage(img_bio)
        ws.add_image(xl_img, 'L2')

        excel_bio = io.BytesIO()
        wb.save(excel_bio)
        excel_bytes = excel_bio.getvalue()

        self.client.force_authenticate(user=self.admin)
        res = self.client.post(
            '/api/v1/catalog/products/bulk-import/',
            data={
                'excel_file': SimpleUploadedFile('products_embedded.xlsx', excel_bytes, content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
            },
            format='multipart'
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()
        self.assertTrue(data['success'])
        self.assertEqual(data['created_count'], 1)
        self.assertGreaterEqual(data.get('images_extracted', 0), 1)

        product = Product.objects.filter(sku="EMBED-MCB-32A").first()
        self.assertIsNotNone(product)
        self.assertTrue(product.primary_image.startswith('/media/products/'))
        self.assertTrue(ProductImage.objects.filter(product=product, is_primary=True).exists())

    def test_09_template_dropdown_lists_and_validation(self):
        """
        Verify that generate_template_workbook creates the hidden _Lists sheet with
        live Category and Brand dropdown data validation and leaves Image_Source blank in sample data.
        """
        buffer = BulkProductImportService.generate_template_workbook()
        wb = openpyxl.load_workbook(buffer, data_only=False)

        self.assertIn("_Lists", wb.sheetnames)
        ws_lists = wb["_Lists"]
        self.assertEqual(ws_lists.sheet_state, 'hidden')

        # Check column A categories and column B brands
        cat_vals = [ws_lists.cell(row=r, column=1).value for r in range(1, 10) if ws_lists.cell(row=r, column=1).value]
        brand_vals = [ws_lists.cell(row=r, column=2).value for r in range(1, 10) if ws_lists.cell(row=r, column=2).value]
        self.assertIn("Categories", cat_vals)
        self.assertIn("Brands", brand_vals)
        self.assertIn("MCB & Protection", cat_vals)
        self.assertIn("Schneider", brand_vals)

        # Check sample data in Products_Import has empty Image_Source and Gallery_Images
        ws_import = wb["Products_Import"]
        for r in range(2, 5):
            img_val = ws_import.cell(row=r, column=12).value
            gallery_val = ws_import.cell(row=r, column=13).value
            self.assertIn(img_val, ("", None), f"Row {r} Image_Source must be empty string or None")
            self.assertIn(gallery_val, ("", None), f"Row {r} Gallery_Images must be empty string or None")

        # Check Data Validation rules exist
        dvs = ws_import.data_validations.dataValidation
        self.assertGreaterEqual(len(dvs), 2)
        formulas = [dv.formula1 for dv in dvs]
        self.assertTrue(any("_Lists!$A$2:" in f for f in formulas))
        self.assertTrue(any("_Lists!$B$2:" in f for f in formulas))

    def test_10_place_in_cell_value_error_image_import(self):
        """
        Verify that 'Place in Cell' images where openpyxl reads '#VALUE!' in cell L
        are extracted directly from the ZIP package XLRICHVALUE chain, including when
        multiple rows share the same vm index (e.g. vm='1' on Row 2 and Row 4).
        """
        # Create base openpyxl workbook with 3 rows containing #VALUE! in Image_Source (col 12)
        base_xlsx = self._build_excel_file([
            [
                "IN-CELL-MCB-16A",
                "Schneider Acti9 In-Cell Image MCB 16A",
                "mcb & protection",  # test case-insensitive match
                "schneider",         # test case-insensitive match
                350.00,
                310.00,
                20,
                18,
                "Piece",
                "Test in-cell MCB 16A",
                "Poles: 1P",
                "#VALUE!",           # Excel 'Place in Cell' cell value (vm=1)
                "",
                "TRUE",
            ],
            [
                "IN-CELL-MCB-32A",
                "Schneider Acti9 In-Cell Image MCB 32A",
                "MCB & Protection",
                "Schneider",
                550.00,
                490.00,
                15,
                18,
                "Piece",
                "Test in-cell MCB 32A",
                "Poles: 2P",
                "#VALUE!",           # Excel 'Place in Cell' cell value (vm=2)
                "",
                "TRUE",
            ],
            [
                "IN-CELL-MCB-63A",
                "Schneider Acti9 In-Cell Image MCB 63A",
                "MCB & Protection",
                "Schneider",
                850.00,
                780.00,
                10,
                18,
                "Piece",
                "Test in-cell MCB 63A",
                "Poles: 3P",
                "#VALUE!",           # Excel 'Place in Cell' cell value (shares vm=1!)
                "",
                "TRUE",
            ]
        ])

        # Inject modern M365 XLRICHVALUE Media into the openpyxl ZIP
        raw_img1 = self._create_dummy_image_bytes('JPEG', (50, 50), color=(255, 100, 0))
        raw_img2 = self._create_dummy_image_bytes('PNG', (60, 60), color=(0, 150, 255))
        in_mem_zip = io.BytesIO()

        with zipfile.ZipFile(io.BytesIO(base_xlsx), 'r') as zin, zipfile.ZipFile(in_mem_zip, 'w', zipfile.ZIP_DEFLATED) as zout:
            for item in zin.infolist():
                if item.filename == 'xl/worksheets/sheet1.xml':
                    sheet_xml = zin.read(item.filename).decode('utf-8')
                    # Add vm="1" to cell L2, vm="2" to cell L3, vm="1" to cell L4 (sharing vm=1)
                    sheet_xml = sheet_xml.replace('<c r="L2"', '<c r="L2" vm="1"')
                    sheet_xml = sheet_xml.replace('<c r="L3"', '<c r="L3" vm="2"')
                    sheet_xml = sheet_xml.replace('<c r="L4"', '<c r="L4" vm="1"')
                    zout.writestr(item, sheet_xml.encode('utf-8'))
                else:
                    zout.writestr(item, zin.read(item.filename))

            # Add metadata.xml with XLRICHVALUE futureMetadata and valueMetadata
            zout.writestr('xl/metadata.xml', '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<metadata xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:xlrd="http://schemas.microsoft.com/office/spreadsheetml/2017/richdata">
    <metadataTypes count="1">
        <metadataType name="XLRICHVALUE" minVersion="120000" copy="1" side="1" delete="1" reload="1"/>
    </metadataTypes>
    <futureMetadata name="XLRICHVALUE" count="2">
        <bk>
            <extLst>
                <ext uri="{00000000-0000-0000-0000-000000000000}">
                    <xlrd:rvb i="0"/>
                </ext>
            </extLst>
        </bk>
        <bk>
            <extLst>
                <ext uri="{00000000-0000-0000-0000-000000000000}">
                    <xlrd:rvb i="1"/>
                </ext>
            </extLst>
        </bk>
    </futureMetadata>
    <valueMetadata count="2">
        <bk>
            <rc t="1" v="0"/>
        </bk>
        <bk>
            <rc t="1" v="1"/>
        </bk>
    </valueMetadata>
</metadata>''')
            # Add rdrichvalue.xml
            zout.writestr('xl/richData/rdrichvalue.xml', '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<rvData xmlns="http://schemas.microsoft.com/office/spreadsheetml/2017/richdata">
    <rv s="0"><v>0</v></rv>
    <rv s="0"><v>1</v></rv>
</rvData>''')
            # Add richValueRel.xml
            zout.writestr('xl/richData/richValueRel.xml', '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<richValueRels xmlns="http://schemas.microsoft.com/office/spreadsheetml/2022/richvaluerel"
               xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
    <rel r:id="rId1"/>
    <rel r:id="rId2"/>
</richValueRels>''')
            # Add richValueRel.xml.rels
            zout.writestr('xl/richData/_rels/richValueRel.xml.rels', '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
    <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.jpeg"/>
    <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image2.png"/>
</Relationships>''')
            # Add media files
            zout.writestr('xl/media/image1.jpeg', raw_img1)
            zout.writestr('xl/media/image2.png', raw_img2)

        in_cell_excel_bytes = in_mem_zip.getvalue()

        # Import via endpoint
        self.client.force_authenticate(user=self.admin)
        res = self.client.post(
            '/api/v1/catalog/products/bulk-import/',
            data={
                'excel_file': SimpleUploadedFile('incell_products.xlsx', in_cell_excel_bytes, content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
            },
            format='multipart'
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()
        self.assertTrue(data['success'])
        self.assertEqual(data['created_count'], 3)
        self.assertEqual(data['error_count'], 0)
        self.assertEqual(data.get('images_extracted', 0), 3)

        # Check DB products
        prod1 = Product.objects.filter(sku="IN-CELL-MCB-16A").first()
        prod2 = Product.objects.filter(sku="IN-CELL-MCB-32A").first()
        prod3 = Product.objects.filter(sku="IN-CELL-MCB-63A").first()
        self.assertIsNotNone(prod1)
        self.assertIsNotNone(prod2)
        self.assertIsNotNone(prod3)

        self.assertTrue(prod1.primary_image.startswith('/media/products/'))
        self.assertTrue(prod2.primary_image.startswith('/media/products/'))
        self.assertTrue(prod3.primary_image.startswith('/media/products/'))

        # Ensure category and brand reused existing without duplicate
        self.assertEqual(prod1.category.id, self.category.id)
        self.assertEqual(prod1.brand.id, self.brand.id)
        self.assertEqual(Category.objects.count(), 1)
        self.assertEqual(Brand.objects.count(), 1)

