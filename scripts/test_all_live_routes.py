import urllib.request

test_urls = [
    'https://veepowerelectricals.com/',
    'https://veepowerelectricals.com/shop',
    'https://veepowerelectricals.com/categories',
    'https://veepowerelectricals.com/categories/fans',
    'https://veepowerelectricals.com/categories/wires-cables',
    'https://veepowerelectricals.com/brands',
    'https://veepowerelectricals.com/brands/polycab',
    'https://veepowerelectricals.com/brands/schneider-electric',
    'https://veepowerelectricals.com/locations/tamil-nadu',
    'https://veepowerelectricals.com/locations/tamil-nadu/coimbatore',
    'https://veepowerelectricals.com/locations/tamil-nadu/chennai',
    'https://veepowerelectricals.com/locations/tamil-nadu/madurai',
    'https://veepowerelectricals.com/guides',
    'https://veepowerelectricals.com/guides/home-electrical-wiring-safety-guide',
    'https://veepowerelectricals.com/about',
    'https://veepowerelectricals.com/contact',
    'https://veepowerelectricals.com/privacy-policy',
    'https://veepowerelectricals.com/terms-and-conditions',
    'https://veepowerelectricals.com/shipping-policy',
    'https://veepowerelectricals.com/return-policy',
    'https://veepowerelectricals.com/product/havells-stealth-1200mm-ceiling-fan',
    'https://veepowerelectricals.com/product/1'
]

print("=== VERIFYING ALL LIVE PUBLIC ROUTES ===")
for url in test_urls:
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
        with urllib.request.urlopen(req, timeout=10) as resp:
            print(f"[{resp.status}] {url}")
    except Exception as e:
        print(f"[FAIL] {url} - {e}")
