import os
from pathlib import Path
from dotenv import load_dotenv

# PyMySQL setup for MySQL database engine
try:
    import pymysql
    pymysql.install_as_MySQLdb()
except ImportError:
    pass

BASE_DIR = Path(__file__).resolve().parent.parent.parent
load_dotenv(BASE_DIR / '.env')
load_dotenv(BASE_DIR.parent / '.env')

SECRET_KEY = os.getenv('DJANGO_SECRET_KEY', 'django-insecure-vee-power-electricals-secret-key-change-in-prod')

DEBUG = os.getenv('DJANGO_DEBUG', 'True').lower() in ('true', '1', 't')

ALLOWED_HOSTS = os.getenv('ALLOWED_HOSTS', '*').split(',')

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    
    # Third party apps
    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',
    'corsheaders',
    
    # Local apps
    'apps.users.apps.UsersConfig',
    'apps.commercial_config.apps.CommercialConfigConfig',
    'apps.products.apps.ProductsConfig',
    'apps.inventory.apps.InventoryConfig',
    'apps.orders.apps.OrdersConfig',
    'apps.finance.apps.FinanceConfig',
    'apps.core.apps.CoreConfig',
    'apps.common.apps.CommonConfig',
    'apps.admin_settings.apps.AdminSettingsConfig',
]

MIDDLEWARE = [
    'apps.common.middleware.RequestIdMiddleware',
    'apps.common.middleware.SecurityHeadersMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'
ASGI_APPLICATION = 'config.asgi.application'

# Database: MySQL with SQLite fallback if MySQL is not available
DB_ENGINE = os.getenv('DATABASE_ENGINE', 'django.db.backends.mysql')
DB_NAME = os.getenv('DATABASE_NAME', 'veepower_db')
DB_USER = os.getenv('DATABASE_USER', 'root')
DB_PASSWORD = os.getenv('DATABASE_PASSWORD', 'root')
DB_HOST = os.getenv('DATABASE_HOST', '127.0.0.1')
DB_PORT = os.getenv('DATABASE_PORT', '3306')

DATABASES = {
    'default': {
        'ENGINE': DB_ENGINE,
        'NAME': DB_NAME,
        'USER': DB_USER,
        'PASSWORD': DB_PASSWORD,
        'HOST': DB_HOST,
        'PORT': DB_PORT,
        'OPTIONS': {
            'charset': 'utf8mb4',
        } if 'mysql' in DB_ENGINE else {}
    }
}

AUTH_USER_MODEL = 'users.User'

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# Application release identifier surfaced read-only on the Admin Settings > System
# section. This is a deployment constant, not an administrator-editable setting.
APP_VERSION = os.getenv('APP_VERSION', '1.0.0')

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'Asia/Kolkata'
USE_I18N = True
USE_TZ = True

STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_THROTTLE_CLASSES': (
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
    ),
    'DEFAULT_THROTTLE_RATES': {
        'anon': os.getenv('THROTTLE_RATE_ANON', '120/minute'),
        'user': os.getenv('THROTTLE_RATE_USER', '1000/minute'),
        'auth': os.getenv('THROTTLE_RATE_AUTH', '100/minute'),
    },
    'DEFAULT_PAGINATION_CLASS': 'apps.common.pagination.StandardResultsSetPagination',
    'PAGE_SIZE': 20,
    'EXCEPTION_HANDLER': 'apps.common.exceptions.custom_exception_handler',
}

from datetime import timedelta

# JWT Authentication Strategy: HS256 Symmetric Signing
# Access Token Lifetime: 30 minutes
# Refresh Token Lifetime: 7 days
# Token Rotation: Enabled (issues new refresh token on refresh)
# Token Blacklist: Enabled (blacklists old refresh token upon rotation & logout)
JWT_SECRET_KEY = os.getenv('JWT_SECRET_KEY', SECRET_KEY)

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=30),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'UPDATE_LAST_LOGIN': True,
    'ALGORITHM': 'HS256',
    'SIGNING_KEY': JWT_SECRET_KEY,
    'VERIFYING_KEY': None,
    'AUDIENCE': None,
    'ISSUER': 'veepower-auth',
    'AUTH_HEADER_TYPES': ('Bearer',),
    'AUTH_HEADER_NAME': 'HTTP_AUTHORIZATION',
    'USER_ID_FIELD': 'id',
    'USER_ID_CLAIM': 'user_id',
    'USER_AUTHENTICATION_RULE': 'rest_framework_simplejwt.authentication.default_user_authentication_rule',
    'AUTH_TOKEN_CLASSES': ('rest_framework_simplejwt.tokens.AccessToken',),
    'TOKEN_TYPE_CLAIM': 'token_type',
    'JTI_CLAIM': 'jti',
}

# Password Reset & Customer Communication Configuration
PASSWORD_RESET_TIMEOUT = 86400  # 24 hours in seconds
EMAIL_BACKEND = os.getenv('EMAIL_BACKEND', 'django.core.mail.backends.console.EmailBackend')
EMAIL_HOST = os.getenv('EMAIL_HOST', 'localhost')
EMAIL_PORT = int(os.getenv('EMAIL_PORT', 587))
EMAIL_HOST_USER = os.getenv('EMAIL_HOST_USER', '')
EMAIL_HOST_PASSWORD = os.getenv('EMAIL_HOST_PASSWORD', '')
EMAIL_USE_TLS = os.getenv('EMAIL_USE_TLS', 'True').lower() in ('true', '1', 't')
EMAIL_USE_SSL = os.getenv('EMAIL_USE_SSL', 'False').lower() in ('true', '1', 't')
EMAIL_TIMEOUT = int(os.getenv('EMAIL_TIMEOUT', 10))
DEFAULT_FROM_EMAIL = os.getenv('DEFAULT_FROM_EMAIL', 'Vee Power Electricals <veepower.cbe@gmail.com>')
FRONTEND_URL = os.getenv('FRONTEND_URL', os.getenv('FRONTEND_BASE_URL', 'http://localhost:5173')).rstrip('/')
FRONTEND_BASE_URL = FRONTEND_URL
BACKEND_BASE_URL = os.getenv('BACKEND_BASE_URL', 'http://localhost:8000').rstrip('/')

# Brevo Transactional Email Configuration
BREVO_API_KEY = os.getenv('BREVO_API_KEY', '')
BREVO_SENDER_EMAIL = os.getenv('BREVO_SENDER_EMAIL', 'veepower.cbe@gmail.com')
BREVO_SENDER_NAME = os.getenv('BREVO_SENDER_NAME', 'Vee Power Electricals')
BREVO_API_URL = os.getenv('BREVO_API_URL', 'https://api.brevo.com/v3/smtp/email')
BREVO_REQUEST_TIMEOUT = int(os.getenv('BREVO_REQUEST_TIMEOUT', 10))

# Test Mode & Allowlist (Strictly fail-closed)
EMAIL_TEST_MODE = os.getenv('EMAIL_TEST_MODE', 'true').lower() in ('true', '1', 't')
raw_test_allowlist = os.getenv('EMAIL_TEST_ALLOWLIST', 'balaadhish.cbe@gmail.com,balaadhish333@gmail.com')
EMAIL_TEST_ALLOWLIST = [e.strip().lower() for e in raw_test_allowlist.split(',') if e.strip()]

# Outbox & Asynchronous Delivery
EMAIL_ASYNC_DISPATCH = os.getenv('EMAIL_ASYNC_DISPATCH', 'True').lower() in ('true', '1', 't')
EMAIL_OUTBOX_MAX_RETRIES = int(os.getenv('EMAIL_OUTBOX_MAX_RETRIES', 3))

# CORS Configuration (Strict allowlisting; no wildcard credentials)
CORS_ALLOW_ALL_ORIGINS = False
raw_cors = os.getenv('CORS_ALLOWED_ORIGINS', '')
CORS_ALLOWED_ORIGINS = [c.strip() for c in raw_cors.split(',') if c.strip()] if raw_cors else [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:80',
    'http://localhost',
    'http://127.0.0.1:80',
    'http://127.0.0.1',
]
CORS_ALLOW_CREDENTIALS = True
from corsheaders.defaults import default_headers
CORS_ALLOW_HEADERS = list(default_headers) + [
    'x-request-id',
]

# CSRF Trusted Origins
raw_csrf = os.getenv('CSRF_TRUSTED_ORIGINS', '')
CSRF_TRUSTED_ORIGINS = [c.strip() for c in raw_csrf.split(',') if c.strip()] if raw_csrf else [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:80',
    'http://localhost',
    'http://127.0.0.1:80',
    'http://127.0.0.1',
]

# Security Headers & Cookie Policies
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'
SECURE_REFERRER_POLICY = 'strict-origin-when-cross-origin'
SECURE_CROSS_ORIGIN_OPENER_POLICY = 'same-origin'
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = 'Lax'
CSRF_COOKIE_SAMESITE = 'Lax'

# Google Sign-In & OAuth 2.0 Configuration
# Google acts strictly as an external identity provider. No Google data store is used.
# Client secrets are never exposed through API responses, frontend bundles, or client settings.
GOOGLE_CLIENT_ID = os.getenv('GOOGLE_CLIENT_ID', '')
GOOGLE_CLIENT_SECRET = os.getenv('GOOGLE_CLIENT_SECRET', '')
GOOGLE_REDIRECT_URI = os.getenv('GOOGLE_REDIRECT_URI', 'http://localhost:8000/auth/google/callback')
GOOGLE_AUTH_URI = os.getenv('GOOGLE_AUTH_URI', 'https://accounts.google.com/o/oauth2/v2/auth')
GOOGLE_TOKEN_URI = os.getenv('GOOGLE_TOKEN_URI', 'https://oauth2.googleapis.com/token')
GOOGLE_TOKENINFO_URL = os.getenv(
    'GOOGLE_TOKENINFO_URL',
    'https://oauth2.googleapis.com/tokeninfo',
)
GOOGLE_ISSUERS = ('accounts.google.com', 'https://accounts.google.com')
GOOGLE_SCOPES = ['openid', 'email', 'profile']

# Payment Gateway Configuration (Razorpay)
RAZORPAY_KEY_ID = os.getenv('RAZORPAY_KEY_ID', 'rzp_test_mock_veepower_key')
RAZORPAY_KEY_SECRET = os.getenv('RAZORPAY_KEY_SECRET', 'mock_veepower_secret_key_12345')
RAZORPAY_WEBHOOK_SECRET = os.getenv('RAZORPAY_WEBHOOK_SECRET', 'mock_veepower_webhook_secret_67890')

# Structured Logging with Correlation Request ID
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'filters': {
        'request_id': {
            '()': 'apps.common.middleware.RequestIdFilter',
        },
    },
    'formatters': {
        'standard': {
            'format': '[%(asctime)s] [%(levelname)s] [req:%(request_id)s] [%(name)s:%(lineno)d] %(message)s',
            'datefmt': '%Y-%m-%d %H:%M:%S',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'standard',
            'filters': ['request_id'],
        },
    },
    'root': {
        'handlers': ['console'],
        'level': os.getenv('DJANGO_LOG_LEVEL', 'INFO'),
    },
    'loggers': {
        'django': {
            'handlers': ['console'],
            'level': os.getenv('DJANGO_LOG_LEVEL', 'INFO'),
            'propagate': False,
        },
        'apps': {
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': False,
        },
    },
}

