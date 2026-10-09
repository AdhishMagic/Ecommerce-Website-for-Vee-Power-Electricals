import io
from PIL import Image
from django.test import TestCase
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient
from rest_framework import status

from apps.users.models import User, UserRole
from apps.products.models import Category, Brand, Product


class ProductImageManagementTests(TestCase):
    """
    Comprehensive tests for Product Image Management:
    1. Administrator upload authorization & RBAC
    2. File type and content validation with Pillow (JPEG, PNG, WebP)
    3. Rejection of corrupted/spoofed files and >5MB files
    4. Image persistence on product creation and update
    5. Preserving existing image during unrelated field updates
    6. Resetting / using category default
    """

    def setUp(self):
        self.client = APIClient()

        self.admin = User.objects.create_user(
            username='admin_img_test',
            email='admin_img@veepower.com',
            password='AdminPassword123!',
            role=UserRole.ADMIN,
            is_staff=True,
        )

        self.customer = User.objects.create_user(
            username='cust_img_test',
            email='cust_img@veepower.com',
            password='CustomerPassword123!',
            role=UserRole.CUSTOMER,
        )

        self.category = Category.objects.create(
            name='Fans',
            slug='fans',
            icon='🌀',
            is_active=True,
        )

        self.brand = Brand.objects.create(
            name='Havells',
            slug='havells',
            is_active=True,
        )

    def _create_dummy_image(self, fmt='JPEG', size=(100, 100), color=(255, 0, 0)):
        file_obj = io.BytesIO()
        image = Image.new('RGB', size, color)
        image.save(file_obj, format=fmt)
        file_obj.seek(0)
        return file_obj

    def test_anonymous_and_customer_cannot_upload_image(self):
        img_io = self._create_dummy_image('JPEG')
        uploaded = SimpleUploadedFile("test.jpg", img_io.read(), content_type="image/jpeg")

        # Unauthenticated
        res = self.client.post('/api/v1/catalog/products/upload-image/', {'file': uploaded}, format='multipart')
        self.assertIn(res.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

        # Customer
        self.client.force_authenticate(user=self.customer)
        img_io.seek(0)
        uploaded = SimpleUploadedFile("test.jpg", img_io.read(), content_type="image/jpeg")
        res = self.client.post('/api/v1/catalog/products/upload-image/', {'file': uploaded}, format='multipart')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_upload_valid_jpeg_png_webp(self):
        self.client.force_authenticate(user=self.admin)

        for fmt, ext, mime in [('JPEG', 'jpg', 'image/jpeg'), ('PNG', 'png', 'image/png'), ('WEBP', 'webp', 'image/webp')]:
            img_io = self._create_dummy_image(fmt)
            uploaded = SimpleUploadedFile(f"test.{ext}", img_io.read(), content_type=mime)
            res = self.client.post('/api/v1/catalog/products/upload-image/', {'file': uploaded}, format='multipart')
            self.assertEqual(res.status_code, status.HTTP_201_CREATED, f"Failed for {fmt}: {res.data}")
            self.assertTrue(res.data['image_url'].startswith('/media/products/'))
            self.assertTrue(res.data['image_url'].endswith(f".{ext}"))

    def test_reject_unsupported_or_spoofed_file(self):
        self.client.force_authenticate(user=self.admin)

        # Spoofed file: text content renamed to .jpg
        fake_content = b"<?php echo 'malicious'; ?> not a real image"
        fake_file = SimpleUploadedFile("fake.jpg", fake_content, content_type="image/jpeg")
        res = self.client.post('/api/v1/catalog/products/upload-image/', {'file': fake_file}, format='multipart')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('detail', res.data)

    def test_reject_oversized_file(self):
        self.client.force_authenticate(user=self.admin)

        # 6MB dummy content
        oversized_content = b"0" * (6 * 1024 * 1024)
        big_file = SimpleUploadedFile("big.jpg", oversized_content, content_type="image/jpeg")
        res = self.client.post('/api/v1/catalog/products/upload-image/', {'file': big_file}, format='multipart')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('5MB', res.data['detail'])

    def test_product_create_and_update_with_image(self):
        self.client.force_authenticate(user=self.admin)

        # 1. Upload custom image
        img_io = self._create_dummy_image('JPEG')
        uploaded = SimpleUploadedFile("fan_custom.jpg", img_io.read(), content_type="image/jpeg")
        upload_res = self.client.post('/api/v1/catalog/products/upload-image/', {'file': uploaded}, format='multipart')
        self.assertEqual(upload_res.status_code, status.HTTP_201_CREATED)
        custom_url = upload_res.data['image_url']

        # 2. Create product with uploaded image
        create_payload = {
            'name': 'Havells Stealth Air 1200',
            'sku': 'TEST-HVL-001',
            'category': self.category.id,
            'brand': self.brand.id,
            'price': 3200,
            'mrp': 4000,
            'stock': 25,
            'primary_image': custom_url,
            'active': True,
        }
        res = self.client.post('/api/v1/catalog/products/', create_payload)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        prod_id = res.data['id']
        self.assertEqual(res.data['primary_image'], custom_url)

        # 3. Update unrelated field (e.g. price and name) without touching image -> image preserved
        update_payload = {
            'name': 'Havells Stealth Air 1200 V2',
            'price': 3350,
        }
        patch_res = self.client.patch(f'/api/v1/catalog/products/{prod_id}/', update_payload)
        self.assertEqual(patch_res.status_code, status.HTTP_200_OK)
        self.assertEqual(patch_res.data['primary_image'], custom_url)
        self.assertEqual(patch_res.data['name'], 'Havells Stealth Air 1200 V2')

        # 4. Reset to category default (clear custom image or set to category default)
        reset_payload = {
            'primary_image': '/media/defaults/fans.webp',
        }
        reset_res = self.client.patch(f'/api/v1/catalog/products/{prod_id}/', reset_payload)
        self.assertEqual(reset_res.status_code, status.HTTP_200_OK)
        self.assertEqual(reset_res.data['primary_image'], '/media/defaults/fans.webp')

    def test_create_product_without_image_gets_category_default(self):
        self.client.force_authenticate(user=self.admin)

        create_payload = {
            'name': 'Havells Standard Fan Without Custom Image',
            'sku': 'TEST-HVL-NOIMG',
            'category': self.category.id,
            'brand': self.brand.id,
            'price': 2500,
            'mrp': 3000,
            'stock': 15,
            'active': True,
        }
        res = self.client.post('/api/v1/catalog/products/', create_payload)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertIn('/media/defaults/fans.webp', res.data.get('primary_image', ''))

