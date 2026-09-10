from .base import *

DEBUG = True

# Allows SQLite fallback for easy local dev testing when MySQL container is off
if os.getenv('USE_SQLITE', 'True').lower() in ('true', '1', 't'):
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    }
