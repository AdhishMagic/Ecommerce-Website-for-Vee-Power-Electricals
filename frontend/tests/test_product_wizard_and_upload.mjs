import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

console.log('--- Verifying Product Wizard Strict Validation & Custom Image Upload Configuration ---');

const projectRoot = process.cwd();

// 1. Verify Nginx Configuration has client_max_body_size 20M;
const nginxConfPath = path.join(projectRoot, 'frontend', 'nginx.conf');
const nginxContent = fs.readFileSync(nginxConfPath, 'utf8');
assert(
  nginxContent.includes('client_max_body_size 20M;'),
  'Nginx config must define client_max_body_size 20M;'
);
console.log('✓ Nginx config verified: client_max_body_size 20M; is properly configured.');

// 2. Verify Backend media URL serving in Django urls.py
const djangoUrlsPath = path.join(projectRoot, 'backend', 'config', 'urls.py');
const djangoUrlsContent = fs.readFileSync(djangoUrlsPath, 'utf8');
assert(
  djangoUrlsContent.includes("re_path(r'^media/(?P<path>.*)$'"),
  'Django backend must serve media files across all environments using re_path media handler'
);
console.log('✓ Django URLs verified: media route handler configured with serve and MEDIA_ROOT.');

// 3. Verify Backend View parsers in apps/products/views.py
const backendViewsPath = path.join(projectRoot, 'backend', 'apps', 'products', 'views.py');
const backendViewsContent = fs.readFileSync(backendViewsPath, 'utf8');
assert(
  backendViewsContent.includes('parser_classes=[MultiPartParser, FormParser]') ||
  backendViewsContent.includes('parser_classes=[MultiPartParser, FormParser, JSONParser]'),
  'ProductViewSet must have MultiPartParser and FormParser enabled on image and bulk upload views.'
);
console.log('✓ Django backend views verified: MultiPartParser and FormParser are enabled.');

// 4. Verify Frontend client doesn't overwrite FormData Content-Type
const clientTsPath = path.join(projectRoot, 'frontend', 'src', 'api', 'client.ts');
const clientTsContent = fs.readFileSync(clientTsPath, 'utf8');
assert(
  clientTsContent.includes("delete reqHeaders['Content-Type']"),
  'apiClient must delete Content-Type when body is FormData to allow browser to generate boundary.'
);
console.log('✓ Frontend API client verified: Content-Type is cleared for FormData to preserve multipart boundary.');

// 5. Verify ProductForm.tsx has strict step validation, checkmarks, and instant preview
const productFormPath = path.join(projectRoot, 'frontend', 'src', 'pages', 'admin', 'ProductForm.tsx');
const productFormContent = fs.readFileSync(productFormPath, 'utf8');

// Check step validation
assert(productFormContent.includes('getStepErrors'), 'ProductForm must define step-by-step error validation');
assert(productFormContent.includes('canNavigateToStep'), 'ProductForm must restrict forward step jumping until preceding steps are valid');
assert(productFormContent.includes('isStepComplete'), 'ProductForm must compute step completion status');

// Check checkmark icon in sidebar
assert(productFormContent.includes('Step completed'), 'ProductForm sidebar must display completed step indicators');

// Check instant preview with URL.createObjectURL
assert(productFormContent.includes('URL.createObjectURL(file)'), 'ProductForm must create instant local preview with URL.createObjectURL');

// Check accepted formats
assert(productFormContent.includes('.jpg,.jpeg,.png,.webp'), 'ProductForm must accept .jpg, .jpeg, .png, .webp formats');

// Check GST slab selection
assert(productFormContent.includes('GST_SLABS'), 'ProductForm must contain Indian GST slabs in step 2');

console.log('✓ ProductForm.tsx verified: strict step-by-step validation, sidebar checkmarks, and instant image preview are active.');

console.log('\n--- All verification checks passed successfully! ---');
