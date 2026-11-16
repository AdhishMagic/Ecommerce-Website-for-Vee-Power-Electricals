import { useEffect } from 'react';

export interface SEOHeadProps {
  title?: string;
  description?: string;
  canonicalUrl?: string;
  ogImage?: string;
  ogType?: 'website' | 'product' | 'article';
  robots?: string;
  keywords?: string;
  jsonLd?: Record<string, any> | Array<Record<string, any>>;
  productData?: {
    price?: number | string;
    currency?: string;
    availability?: 'InStock' | 'OutOfStock';
    brand?: string;
    sku?: string;
  };
}

const DEFAULT_TITLE = 'Vee Power Electricals - Genuine Electrical Products in Coimbatore';
const DEFAULT_DESCRIPTION =
  'Buy genuine electrical supplies, industrial switchgear, LED lights, wires, and modular switches in Coimbatore and across India from Vee Power Electricals.';
const PRIMARY_DOMAIN = 'https://veepowerelectricals.com';
const DEFAULT_OG_IMAGE = `${PRIMARY_DOMAIN}/logo.png`;

/**
 * Enterprise SEO Head manager for React SPA.
 * Manages document head elements (title, meta, canonical link, Open Graph, Twitter cards, and JSON-LD).
 */
export default function SEOHead({
  title,
  description = DEFAULT_DESCRIPTION,
  canonicalUrl,
  ogImage = DEFAULT_OG_IMAGE,
  ogType = 'website',
  robots = 'index, follow',
  keywords,
  jsonLd,
  productData,
}: SEOHeadProps) {
  const fullTitle = title
    ? `${title} | Vee Power Electricals`
    : DEFAULT_TITLE;

  const resolvedCanonical = canonicalUrl
    ? (canonicalUrl.startsWith('http') ? canonicalUrl : `${PRIMARY_DOMAIN}${canonicalUrl}`)
    : typeof window !== 'undefined'
      ? `${PRIMARY_DOMAIN}${window.location.pathname}`
      : PRIMARY_DOMAIN;

  const resolvedImage = ogImage.startsWith('http')
    ? ogImage
    : `${PRIMARY_DOMAIN}${ogImage.startsWith('/') ? ogImage : `/${ogImage}`}`;

  useEffect(() => {
    // 1. Document Title
    document.title = fullTitle;

    // Helper to set or create meta tags
    const setMetaTag = (attribute: string, key: string, content: string | undefined) => {
      if (!content) return;
      let el = document.querySelector(`meta[${attribute}="${key}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attribute, key);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };

    // 2. Standard Metadata
    setMetaTag('name', 'description', description);
    setMetaTag('name', 'robots', robots);
    if (keywords) {
      setMetaTag('name', 'keywords', keywords);
    }

    // 3. Canonical Link Tag
    let canonicalLink = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonicalLink) {
      canonicalLink = document.createElement('link');
      canonicalLink.setAttribute('rel', 'canonical');
      document.head.appendChild(canonicalLink);
    }
    canonicalLink.setAttribute('href', resolvedCanonical);

    // 4. Open Graph Metadata
    setMetaTag('property', 'og:title', fullTitle);
    setMetaTag('property', 'og:description', description);
    setMetaTag('property', 'og:url', resolvedCanonical);
    setMetaTag('property', 'og:image', resolvedImage);
    setMetaTag('property', 'og:type', ogType);
    setMetaTag('property', 'og:site_name', 'Vee Power Electricals');

    if (productData) {
      if (productData.price) {
        setMetaTag('property', 'product:price:amount', String(productData.price));
      }
      setMetaTag('property', 'product:price:currency', productData.currency || 'INR');
      if (productData.availability) {
        setMetaTag('property', 'product:availability', productData.availability);
      }
    }

    // 5. Twitter Card Metadata
    setMetaTag('name', 'twitter:card', 'summary_large_image');
    setMetaTag('name', 'twitter:title', fullTitle);
    setMetaTag('name', 'twitter:description', description);
    setMetaTag('name', 'twitter:image', resolvedImage);

    // 6. JSON-LD Structured Data
    const scriptId = 'seo-structured-data';
    let scriptTag = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (jsonLd) {
      if (!scriptTag) {
        scriptTag = document.createElement('script');
        scriptTag.id = scriptId;
        scriptTag.type = 'application/ld+json';
        document.head.appendChild(scriptTag);
      }
      scriptTag.textContent = JSON.stringify(jsonLd);
    } else if (scriptTag) {
      scriptTag.remove();
    }

    return () => {
      // Clean up JSON-LD on route change
      const s = document.getElementById(scriptId);
      if (s) s.remove();
    };
  }, [fullTitle, description, resolvedCanonical, resolvedImage, ogType, robots, keywords, jsonLd, productData]);

  // React 19 Document Metadata JSX hoisting support
  return (
    <>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <meta name="robots" content={robots} />
      {keywords && <meta name="keywords" content={keywords} />}
      <link rel="canonical" href={resolvedCanonical} />

      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={resolvedCanonical} />
      <meta property="og:image" content={resolvedImage} />
      <meta property="og:type" content={ogType} />
      <meta property="og:site_name" content="Vee Power Electricals" />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={resolvedImage} />

      {jsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      )}
    </>
  );
}
