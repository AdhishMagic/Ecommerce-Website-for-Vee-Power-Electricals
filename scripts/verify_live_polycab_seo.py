import urllib.request
import re
import sys

BASE_URL = "https://veepowerelectricals.com"

def test_endpoint(url, user_agent, desc):
    print(f"\n==================================================")
    print(f"TEST: {desc}")
    print(f"URL:  {url}")
    print(f"UA:   {user_agent}")
    print(f"==================================================")

    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": user_agent,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        }
    )

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            status = resp.status
            headers = dict(resp.getheaders())
            body = resp.read().decode('utf-8', errors='replace')
    except urllib.error.HTTPError as e:
        status = e.code
        headers = dict(e.headers)
        body = e.read().decode('utf-8', errors='replace')
    except Exception as e:
        print(f"ERROR: {e}")
        return False

    print(f"HTTP Status: {status}")
    print(f"Content-Type: {headers.get('Content-Type') or headers.get('content-type')}")
    print(f"X-Robots-Tag: {headers.get('X-Robots-Tag') or headers.get('x-robots-tag') or 'None'}")

    # Check robots meta tags
    robots_tags = re.findall(r'<meta[^>]*name=["\']robots["\'][^>]*>', body, re.IGNORECASE)
    print(f"Robots meta tags count: {len(robots_tags)}")
    for t in robots_tags:
        print(f"  -> {t}")

    # Check canonical links
    canonicals = re.findall(r'<link[^>]*rel=["\']canonical["\'][^>]*>', body, re.IGNORECASE)
    print(f"Canonical link tags count: {len(canonicals)}")
    for c in canonicals:
        print(f"  -> {c}")

    # Check JSON-LD structured data
    jsonld_scripts = re.findall(r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>.*?</script>', body, re.DOTALL | re.IGNORECASE)
    print(f"JSON-LD script tags count: {len(jsonld_scripts)}")
    for j in jsonld_scripts:
        print(f"  Snippet: {j[:150]}...")

    return status, headers, body

def main():
    googlebot_ua = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
    browser_ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

    # 1. Polycab via Googlebot
    s1, h1, b1 = test_endpoint(
        f"{BASE_URL}/brands/polycab",
        googlebot_ua,
        "Polycab Brand Page (Googlebot Crawler Request)"
    )

    # 2. Polycab via Standard Browser
    s2, h2, b2 = test_endpoint(
        f"{BASE_URL}/brands/polycab",
        browser_ua,
        "Polycab Brand Page (Standard Browser Request)"
    )

    # 3. Thin Brand (Gloster) via Googlebot
    s3, h3, b3 = test_endpoint(
        f"{BASE_URL}/brands/gloster",
        googlebot_ua,
        "Gloster Brand Page (Thin Brand Googlebot Request)"
    )

    # 4. Sitemap.xml
    s4, h4, b4 = test_endpoint(
        f"{BASE_URL}/sitemap.xml",
        googlebot_ua,
        "Sitemap.xml Inspection"
    )

    print("\n==================================================")
    print("VERIFICATION ASSERTIONS")
    print("==================================================")

    # Check Polycab Crawler Response
    assert s1 == 200, f"Expected 200 for Polycab crawler, got {s1}"
    assert 'content="index, follow"' in b1, "Polycab crawler HTML must contain 'index, follow'"
    assert 'noindex' not in b1, "Polycab crawler HTML must NOT contain 'noindex'"
    assert 'href="https://veepowerelectricals.com/brands/polycab"' in b1, "Polycab canonical URL mismatch"
    assert '"@type": "Brand"' in b1, "Polycab Schema.org Brand missing"
    assert 'X-Robots-Tag' not in h1 and 'x-robots-tag' not in h1, "Polycab has conflicting X-Robots-Tag"
    print("[PASS] 1. Polycab Googlebot response: HTTP 200, index/follow, self-referencing canonical, Schema.org Brand.")

    # Check Polycab Browser Response
    assert s2 == 200, f"Expected 200 for Polycab browser, got {s2}"
    assert 'X-Robots-Tag' not in h2 and 'x-robots-tag' not in h2, "Polycab browser has conflicting X-Robots-Tag"
    print("[PASS] 2. Polycab browser response: HTTP 200, valid HTML.")

    # Check Gloster Response
    assert s3 == 200, f"Expected 200 for Gloster, got {s3}"
    assert 'content="noindex, follow"' in b3, "Gloster crawler HTML must contain 'noindex, follow'"
    print("[PASS] 3. Thin brand (Gloster) correctly returns noindex, follow.")

    # Check Sitemap
    assert s4 == 200, f"Expected 200 for sitemap, got {s4}"
    assert 'https://veepowerelectricals.com/brands/polycab' in b4, "Polycab brand URL must be in sitemap.xml"
    assert 'https://veepowerelectricals.com/brands/gloster' not in b4, "Thin brand Gloster must NOT be in sitemap.xml"
    assert 'https://veepowerelectricals.com/brands/anchor' not in b4, "Thin brand Anchor must NOT be in sitemap.xml"
    print("[PASS] 4. Sitemap.xml includes indexable Polycab and excludes thin brands (Gloster, Anchor).")

    print("\nALL LIVE PRODUCTION SEO CHECKS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    main()
