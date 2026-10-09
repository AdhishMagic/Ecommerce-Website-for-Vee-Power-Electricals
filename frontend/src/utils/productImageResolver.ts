/**
 * Vee Power Electricals - Centralized Product Image Resolver
 * 
 * Determines the authoritative image to display for any product, following strict priority:
 * 1. Valid, explicitly uploaded product image (data URI or /media/products/...)
 * 2. Valid existing product-specific image (excluding known inappropriate/unrelated stock photos)
 * 3. Appropriate category default image (matched by category ID, slug, or normalized name)
 * 4. A final generic electrical-products fallback
 * 
 * Never displays a broken image icon. Prevents infinite fallback loops.
 */

import { Product } from '../types/product';
import { ProductSummary, ProductDetail } from '../types/api';

// Direct ES Module asset imports - guaranteed to be bundled and served by Vite with proper MIME types
import electricalAccessoriesImg from '../assets/defaults/electrical-accessories.webp';
import ledAndLightingImg from '../assets/defaults/lighting.webp';
import ledLightingImg from '../assets/defaults/led-lighting.webp';
import ledLuminairesImg from '../assets/defaults/led-luminaires.webp';
import mcbDistributionImg from '../assets/defaults/mcb-distribution.webp';
import mcbProtectionImg from '../assets/defaults/mcb-protection.webp';
import switchesImg from '../assets/defaults/switches.webp';
import fansImg from '../assets/defaults/fans.webp';
import wiresCablesImg from '../assets/defaults/wires-cables.webp';
import modularSwitchesImg from '../assets/defaults/modular-switches.webp';
import genericElectricalImg from '../assets/defaults/generic-electrical.webp';

export const GENERIC_FALLBACK_IMAGE = genericElectricalImg;

/**
 * Category-to-default-image mapping.
 * Matches by category ID, slug, and canonical normalized name.
 */
export const CATEGORY_DEFAULT_IMAGES: Record<string, string> = {
  // By Category Slug
  'electrical-accessories': electricalAccessoriesImg,
  'accessories': electricalAccessoriesImg,
  'lighting': ledAndLightingImg,
  'led-lighting': ledLightingImg,
  'led-luminaires': ledLuminairesImg,
  'mcb-distribution': mcbDistributionImg,
  'mcb': mcbProtectionImg,
  'mcb-protection': mcbProtectionImg,
  'switches': switchesImg,
  'fans': fansImg,
  'wires-cables': wiresCablesImg,
  'wires': wiresCablesImg,
  'modular-switches': modularSwitchesImg,

  // By Category ID (from database records)
  '11': fansImg,
  '12': wiresCablesImg,
  '13': modularSwitchesImg,
  '14': ledLightingImg,
  '15': mcbDistributionImg,
  '17': switchesImg,
  '18': ledAndLightingImg,
  '19': mcbProtectionImg,
  '20': electricalAccessoriesImg,
  '22': ledLuminairesImg,
};

/**
 * Normalizes a category string or object into a standardized key.
 */
export function normalizeCategoryKey(
  category?: string | number | { id?: number | string; name?: string; slug?: string } | null
): string {
  if (!category && category !== 0) return '';
  if (typeof category === 'number') {
    const idStr = String(category);
    if (CATEGORY_DEFAULT_IMAGES[idStr]) return idStr;
    return idStr;
  }
  if (typeof category === 'object') {
    if (category.slug) {
      const s = category.slug.toLowerCase().trim();
      if (CATEGORY_DEFAULT_IMAGES[s]) return s;
    }
    if (category.id !== undefined && category.id !== null) {
      const idStr = String(category.id);
      if (CATEGORY_DEFAULT_IMAGES[idStr]) return idStr;
    }
    if (category.name) return normalizeCategoryName(category.name);
    return '';
  }
  return normalizeCategoryName(String(category));
}

export function normalizeCategoryName(name: string): string {
  const clean = name.toLowerCase().trim();
  // Direct matches
  if (clean === 'electrical accessories' || clean === 'accessories') return 'electrical-accessories';
  if (clean === 'led & lighting' || clean === 'led and lighting' || clean === 'led &amp; lighting') return 'lighting';
  if (clean === 'led lighting') return 'led-lighting';
  if (clean === 'led luminaires') return 'led-luminaires';
  if (clean === 'mcb & distribution' || clean === 'mcb and distribution' || clean === 'mcb &amp; distribution' || clean === 'distribution') return 'mcb-distribution';
  if (clean === 'mcb & protection' || clean === 'mcb and protection' || clean === 'mcb &amp; protection' || clean === 'mcb' || clean === 'circuit breaker') return 'mcb-protection';
  if (clean === 'switches' || clean === 'switch') return 'switches';
  if (clean === 'fans' || clean === 'fan') return 'fans';
  if (clean === 'wires & cables' || clean === 'wires and cables' || clean === 'wires &amp; cables' || clean === 'wires' || clean === 'cables') return 'wires-cables';
  if (clean === 'modular switches') return 'modular-switches';

  // Slugified fallback
  return clean.replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

/**
 * Returns the canonical category default image.
 */
export function getCategoryDefaultImage(
  category?: string | number | { id?: number | string; name?: string; slug?: string } | null
): string {
  const key = normalizeCategoryKey(category);
  if (key && CATEGORY_DEFAULT_IMAGES[key]) {
    return CATEGORY_DEFAULT_IMAGES[key];
  }
  return GENERIC_FALLBACK_IMAGE;
}

/**
 * Detects known inappropriate legacy stock images or corrupted/dummy placeholders.
 */
export function isInappropriateOrPlaceholderImage(imageUrl?: string | null): boolean {
  if (!imageUrl || typeof imageUrl !== 'string') return true;
  const trimmed = imageUrl.trim();
  if (!trimmed) return true;

  // Corrupted legacy 70-byte placeholder PNGs:
  if (trimmed.includes('4f1b917f02cc4bd6a10856cce028e143.png') ||
      trimmed.includes('dc0c7dd2f0f641979c0d97778bf45825.png')) {
    return true;
  }

  // Placeholder domain strings:
  if (trimmed.includes('placehold.co') || trimmed.includes('placeholder.com')) {
    return true;
  }

  // Known irrelevant Unsplash stock photos:
  if (trimmed.includes('photo-1544716278-ca5e3f4abd8c') || // Books / library
      trimmed.includes('photo-1550985616-10810253b84d') || // Groceries / coffee
      trimmed.includes('photo-1558618666-fcd25c85cd64') || // Mechanic / tool portrait
      trimmed.includes('photo-1581092160607-ee22621dd758')) { // Factory worker portrait
    return true;
  }

  return false;
}

/**
 * Normalizes an image URL for display:
 * Prepends backend URL to relative `/media/` paths if necessary.
 */
export function normalizeMediaUrl(url?: string | null): string {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (trimmed.startsWith('/media/')) {
    // If it is a category default media path, return our optimized local imported asset
    for (const [key, assetUrl] of Object.entries(CATEGORY_DEFAULT_IMAGES)) {
      if (trimmed.includes(key)) {
        return assetUrl;
      }
    }
    const backendBase = import.meta.env.VITE_API_URL
      ? import.meta.env.VITE_API_URL.replace('/api/v1', '')
      : 'http://localhost:8000';
    return `${backendBase}${trimmed}`;
  }
  return trimmed;
}

export interface ResolveImageOptions {
  product?: Partial<Product> | ProductSummary | ProductDetail | null;
  image?: string | null;
  category?: string | number | { id?: number | string; name?: string; slug?: string } | null;
}

/**
 * Primary resolver function. Resolves the optimal image URL according to the 4-tier priority.
 */
export function resolveProductImage(
  input: string | Partial<Product> | ProductSummary | ProductDetail | ResolveImageOptions | null | undefined,
  explicitCategory?: string | number | { id?: number | string; name?: string; slug?: string } | null
): string {
  if (!input) {
    return getCategoryDefaultImage(explicitCategory);
  }

  let rawImage: string | null = null;
  let cat: any = explicitCategory;

  if (typeof input === 'string') {
    rawImage = input;
  } else if ('product' in input || 'image' in input) {
    // ResolveImageOptions
    const opts = input as ResolveImageOptions;
    rawImage = opts.image || (opts.product as any)?.image || (opts.product as any)?.primary_image || (opts.product as any)?.images?.[0] || null;
    cat = opts.category || (opts.product as any)?.category || explicitCategory;
  } else {
    // Product or ProductSummary or ProductDetail
    const p = input as any;
    rawImage = p.image || p.primary_image || (Array.isArray(p.images) && p.images[0]) || null;
    cat = p.category || cat;
  }

  // 1 & 2: Check for valid custom / product-specific image
  if (rawImage && !isInappropriateOrPlaceholderImage(rawImage)) {
    // If the image is a category default path (e.g. /media/defaults/fans.webp or /images/defaults/...), resolve to our imported asset
    if (rawImage.includes('/defaults/')) {
      return getCategoryDefaultImage(cat);
    }
    return normalizeMediaUrl(rawImage);
  }

  // 3: Category default
  const categoryDefault = getCategoryDefaultImage(cat);
  if (categoryDefault) {
    return categoryDefault;
  }

  // 4: Final fallback
  return GENERIC_FALLBACK_IMAGE;
}

/**
 * Synthetic image error handler for <img> elements.
 * Prevents infinite fallback loops using a dataset state counter.
 */
export function handleProductImageError(
  event: React.SyntheticEvent<HTMLImageElement, Event>,
  category?: string | number | { id?: number | string; name?: string; slug?: string } | null
): void {
  const target = event.currentTarget;
  const stage = parseInt(target.dataset.fallbackStage || '0', 10);

  if (stage === 0) {
    target.dataset.fallbackStage = '1';
    const catDefault = getCategoryDefaultImage(category);
    if (target.src === catDefault || target.src.endsWith(catDefault)) {
      target.dataset.fallbackStage = '2';
      target.src = GENERIC_FALLBACK_IMAGE;
    } else {
      target.src = catDefault;
    }
  } else if (stage === 1) {
    target.dataset.fallbackStage = '2';
    target.src = GENERIC_FALLBACK_IMAGE;
  } else {
    // Absolute dead-end: detach onerror handler to guarantee no infinite loop
    target.onerror = null;
  }
}
