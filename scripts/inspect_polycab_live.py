import urllib.request

base = "https://veepowerelectricals.com"
targets = [
    ("/brands/polycab", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"),
    ("/brands/polycab", "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"),
    ("/seo/render/?path=/brands/polycab", "Mozilla/5.0"),
]

for path, ua in targets:
    url = f"{base}{path}"
    print(f"\n=== Testing {url} with UA: {ua[:30]}... ===")
    try:
        req = urllib.request.Request(url, headers={'User-Agent': ua})
        with urllib.request.urlopen(req, timeout=10) as resp:
            headers = dict(resp.getheaders())
            print(f"Status: {resp.status}")
            print(f"X-Robots-Tag: {headers.get('x-robots-tag', 'NONE')}")
            print(f"Content-Type: {headers.get('content-type')}")
            body = resp.read().decode('utf-8')
            print(f"Body length: {len(body)}")
            for line in body.splitlines():
                if '<meta name="robots"' in line or 'robots' in line.lower() or '<title>' in line or 'canonical' in line:
                    print("  Match:", line.strip()[:120])
    except Exception as e:
        print(f"Error: {e}")
