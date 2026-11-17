import urllib.request
import json
import xml.etree.ElementTree as ET

url = 'https://veepowerelectricals.com/product/havells-stealth-1200mm-ceiling-fan'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'})
with urllib.request.urlopen(req) as resp:
    html = resp.read().decode('utf-8')

print("=== CRAWLER PRERENDER TEST ===")
print("HTTP Status:", resp.status)
print("Content-Length:", len(html))
print("Has JSON-LD:", 'application/ld+json' in html)

for line in html.splitlines():
    l = line.strip()
    if l.startswith('<title>') or 'name="description"' in l or 'rel="canonical"' in l or 'property="og:title"' in l:
        print("Meta:", l)

if '<script type="application/ld+json">' in html:
    parts = html.split('<script type="application/ld+json">')
    for part in parts[1:]:
        json_str = part.split('</script>')[0].strip()
        data = json.loads(json_str)
        print("\n=== STRUCTURED DATA JSON-LD ===")
        print(json.dumps(data, indent=2))
