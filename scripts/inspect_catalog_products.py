import urllib.request
import json

url = "https://veepowerelectricals.com/api/v1/catalog/products/"
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
with urllib.request.urlopen(req) as resp:
    data = json.loads(resp.read().decode('utf-8'))

print("Total products returned by /api/v1/catalog/products/:", data.get('count'))
print("Results length:", len(data.get('results', [])))
for p in data.get('results', []):
    print(f"ID: {p.get('id')}, Name: {p.get('name')}, Brand: {p.get('brand')}, InStock: {p.get('in_stock')}, Stock: {p.get('stock')}")
