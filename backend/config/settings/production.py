import os
from django.core.exceptions import ImproperlyConfigured
from .base import *

# 1. Strictly enforce DEBUG=False in production
DEBUG = False

# 2. Production Secret Key
SECRET_KEY = os.getenv('DJANGO_SECRET_KEY', SECRET_KEY)
if not SECRET_KEY or 'change-in-prod' in SECRET_KEY or 'insecure' in SECRET_KEY:
    if os.getenv('STRICT_PROD_SECRET', 'False').lower() in ('true', '1'):
        raise ImproperlyConfigured("DJANGO_SECRET_KEY must be set to a secure, unique value in production.")

# 3. Explicit Allowed Hosts
raw_allowed_hosts = os.getenv('ALLOWED_HOSTS', 'localhost,127.0.0.1,backend')
ALLOWED_HOSTS = [h.strip() for h in raw_allowed_hosts.split(',') if h.strip()]

# 4. Explicit CORS and CSRF Configuration (No open wildcards)
CORS_ALLOW_ALL_ORIGINS = False
raw_cors = os.getenv('CORS_ALLOWED_ORIGINS', '')
CORS_ALLOWED_ORIGINS = [c.strip() for c in raw_cors.split(',') if c.strip()] if raw_cors else [
    'http://localhost',
    'http://localhost:80',
    'http://localhost:5173',
]

raw_csrf = os.getenv('CSRF_TRUSTED_ORIGINS', '')
CSRF_TRUSTED_ORIGINS = [c.strip() for c in raw_csrf.split(',') if c.strip()] if raw_csrf else [
    'http://localhost',
    'http://localhost:80',
]

# 5. HTTPS and Security Cookies (Environment-configurable for reverse proxy setups)
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
SECURE_SSL_REDIRECT = os.getenv('SECURE_SSL_REDIRECT', 'False').lower() in ('true', '1')
SESSION_COOKIE_SECURE = os.getenv('SESSION_COOKIE_SECURE', 'False').lower() in ('true', '1')
CSRF_COOKIE_SECURE = os.getenv('CSRF_COOKIE_SECURE', 'False').lower() in ('true', '1')
SECURE_HSTS_SECONDS = int(os.getenv('SECURE_HSTS_SECONDS', '0'))
SECURE_HSTS_INCLUDE_SUBDOMAINS = os.getenv('SECURE_HSTS_INCLUDE_SUBDOMAINS', 'False').lower() in ('true', '1')
SECURE_HSTS_PRELOAD = os.getenv('SECURE_HSTS_PRELOAD', 'False').lower() in ('true', '1')

# 6. Production Static & Media Assets Handling
STATIC_ROOT = BASE_DIR / 'staticfiles'
MEDIA_ROOT = BASE_DIR / 'media'

# 7. Production Structured Logging
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'production': {
            'format': '[%(asctime)s] [%(levelname)s] [%(name)s:%(lineno)d] %(message)s',
            'datefmt': '%Y-%m-%d %H:%M:%S',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'production',
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
        'django.security': {
            'handlers': ['console'],
            'level': 'WARNING',
            'propagate': False,
        },
    },
}
