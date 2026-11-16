import json
import logging
import sys
import urllib.request
import urllib.error
from django.conf import settings

logger = logging.getLogger(__name__)

INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow'


def get_indexnow_api_key():
    return getattr(settings, 'INDEXNOW_API_KEY', 'veepower49e8a5b2f1c07d39e248b61a')


def get_site_domain():
    return getattr(settings, 'SITE_DOMAIN', 'veepowerelectricals.com')


def get_site_url():
    return getattr(settings, 'SITE_URL', 'https://veepowerelectricals.com').rstrip('/')


def get_key_location():
    key = get_indexnow_api_key()
    return f"{get_site_url()}/{key}.txt"


def submit_urls_to_indexnow(urls: list[str], max_retries: int = 2) -> dict:
    """
    Submit one or more updated/created/deleted URLs to IndexNow (Bing, Yandex, etc.).
    Safely catches network errors and logs responses without interrupting application flow.
    """
    key = get_indexnow_api_key()
    host = get_site_domain()
    key_location = get_key_location()

    if not key or not urls:
        return {'status': 'skipped', 'reason': 'No key or empty URL list'}

    # Normalize URLs
    valid_urls = []
    for u in urls:
        if not u:
            continue
        if u.startswith('/'):
            valid_urls.append(f"{get_site_url()}{u}")
        elif host in u:
            valid_urls.append(u)
    
    if not valid_urls:
        return {'status': 'skipped', 'reason': 'No matching URLs for domain'}

    # Deduplicate
    valid_urls = list(dict.fromkeys(valid_urls))[:1000]

    # In automated test runs, mock the network submission for speed and stability
    if 'test' in sys.argv or getattr(settings, 'IS_TESTING', False):
        logger.info(f"[IndexNow (Test Runner)] Mocked submission of {len(valid_urls)} URLs.")
        return {
            'status': 'success',
            'http_status': 200,
            'submitted_count': len(valid_urls),
            'urls': valid_urls,
        }

    payload = {
        "host": host,
        "key": key,
        "keyLocation": key_location,
        "urlList": valid_urls,
    }

    data = json.dumps(payload).encode('utf-8')
    headers = {
        'Content-Type': 'application/json; charset=utf-8',
        'User-Agent': 'VeePowerElectricals-IndexNow/1.0',
    }

    req = urllib.request.Request(
        INDEXNOW_ENDPOINT,
        data=data,
        headers=headers,
        method='POST'
    )

    for attempt in range(1, max_retries + 1):
        try:
            with urllib.request.urlopen(req, timeout=10) as response:
                status_code = response.getcode()
                logger.info(
                    f"[IndexNow] Successfully submitted {len(valid_urls)} URLs. "
                    f"HTTP {status_code}"
                )
                return {
                    'status': 'success',
                    'http_status': status_code,
                    'submitted_count': len(valid_urls),
                    'urls': valid_urls,
                }
        except urllib.error.HTTPError as e:
            logger.warning(
                f"[IndexNow] HTTP error {e.code} on attempt {attempt}: {e.reason}"
            )
            # 422: Unprocessable (key invalid or host mismatch), do not retry
            if e.code in (400, 403, 422):
                return {'status': 'error', 'http_status': e.code, 'reason': str(e.reason)}
        except Exception as e:
            logger.warning(f"[IndexNow] Network error on attempt {attempt}: {str(e)}")

    return {'status': 'failed', 'reason': 'Exceeded maximum retries'}


def notify_product_change(product_slug: str, action: str = 'update') -> dict:
    """
    Notify IndexNow when a product is created, updated, or removed.
    """
    if not product_slug:
        return {'status': 'skipped', 'reason': 'No product slug'}

    url = f"{get_site_url()}/product/{product_slug}"
    logger.info(f"[IndexNow] Queuing notification for product ({action}): {url}")
    return submit_urls_to_indexnow([url])
