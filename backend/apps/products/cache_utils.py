from django.core.cache import cache

CACHE_KEY_CAT_HERO = 'catalog:categories:hero'
CACHE_KEY_CAT_LIST = 'catalog:categories:list'
CACHE_KEY_BRANDS_LIST = 'catalog:brands:list'
CACHE_KEY_STORE_CONFIG = 'config:store:public'


def invalidate_catalog_cache():
    """
    Invalidate in-memory cached responses for categories and hero data.
    """
    try:
        cache.delete(CACHE_KEY_CAT_HERO)
        cache.delete(CACHE_KEY_CAT_LIST)
    except Exception:
        pass


def invalidate_brands_cache():
    """
    Invalidate in-memory cached responses for brands directory.
    """
    try:
        cache.delete(CACHE_KEY_BRANDS_LIST)
    except Exception:
        pass


def invalidate_store_config_cache():
    """
    Invalidate in-memory cached responses for store profile configuration.
    """
    try:
        cache.delete(CACHE_KEY_STORE_CONFIG)
    except Exception:
        pass

