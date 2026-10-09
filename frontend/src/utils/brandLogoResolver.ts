import anchorLogo from '../assets/brands/anchor.svg';
import cromptonLogo from '../assets/brands/crompton.svg';
import finolexLogo from '../assets/brands/finolex.svg';
import glosterLogo from '../assets/brands/gloster.svg';
import havellsLogo from '../assets/brands/havells.svg';
import jaquarLogo from '../assets/brands/jaquar.svg';
import khaitanLogo from '../assets/brands/khaitan.svg';
import legrandLogo from '../assets/brands/legrand.svg';
import philipsLogo from '../assets/brands/philips.svg';
import polycabLogo from '../assets/brands/polycab.svg';
import schneiderLogo from '../assets/brands/schneider.svg';
import { isInappropriateOrPlaceholderImage, normalizeMediaUrl } from './productImageResolver';

export const BRAND_LOGO_MAP: Record<string, string> = {
  anchor: anchorLogo,
  crompton: cromptonLogo,
  finolex: finolexLogo,
  gloster: glosterLogo,
  havells: havellsLogo,
  jaquar: jaquarLogo,
  khaitan: khaitanLogo,
  legrand: legrandLogo,
  philips: philipsLogo,
  polycab: polycabLogo,
  schneider: schneiderLogo,
  'schneider-electric': schneiderLogo,
  'schneider electric': schneiderLogo,
};

/**
 * Normalizes brand string into lookup key
 */
export function normalizeBrandKey(name?: string | null): string {
  if (!name) return '';
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

/**
 * Resolves brand logo URL (prefers verified local SVG assets, then valid backend logo_url, else null)
 */
export function getBrandLogo(brandName?: string | null, customLogoUrl?: string | null): string | null {
  if (!brandName && !customLogoUrl) return null;

  // 1. First check local verified SVG assets
  const key = normalizeBrandKey(brandName);
  if (key && BRAND_LOGO_MAP[key]) {
    return BRAND_LOGO_MAP[key];
  }

  // Check substring matches for local assets
  for (const [mapKey, logoAsset] of Object.entries(BRAND_LOGO_MAP)) {
    if (key.includes(mapKey) || mapKey.includes(key)) {
      return logoAsset;
    }
  }

  // 2. Check if a valid non-placeholder custom backend logo_url was provided
  if (customLogoUrl && !isInappropriateOrPlaceholderImage(customLogoUrl)) {
    return normalizeMediaUrl(customLogoUrl);
  }

  // 3. Official logo unavailable -> return null for text-based fallback
  return null;
}
