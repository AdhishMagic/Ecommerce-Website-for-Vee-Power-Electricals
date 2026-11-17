import urllib.request
import json

base_url = "https://veepowerelectricals.com"

endpoints = [
    "/api/v1/catalog/products/",
    "/api/v1/catalog/brands/",
    "/api/v1/products/",
    "/api/v1/brands/",
]

for ep in endpoints:
    url = f"{base_url}{ep}"
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            count = len(data) if isinstance(data, list) else data.get('count', len(data.get('results', [])))
            print(f"[OK] {ep}: count={count}, type={type(data)}")
            if isinstance(data, dict) and 'results' in data:
                items = data['results']
            elif isinstance(data, list):
                items = data
            else:
                items = []
            for item in items[:4]:
                b = item.get('brand') if isinstance(item, dict) else item
                print(f"   item: {item.get('name') if isinstance(item, dict) else item}, brand: {b}")
    except Exception as e:
        print(f"[ERR] {ep}: {e}")
