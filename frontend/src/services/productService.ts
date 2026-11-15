import { Product, Category, HeroCategory } from '../types/product';
import { catalogApi, ProductFilterParams } from '../api/catalog';
import { ProductSummary, ProductDetail, Category as ApiCategory } from '../types/api';
import {
  resolveProductImage,
  getCategoryDefaultImage,
  isInappropriateOrPlaceholderImage,
} from '../utils/productImageResolver';

export const mapApiProductToProduct = (item: ProductSummary | ProductDetail | any): Product => {
  const brandName =
    typeof item.brand === 'object' && item.brand !== null
      ? (item.brand as any).name
      : item.brand_name || String(item.brand || '');
  const brandId = typeof item.brand === 'object' && item.brand !== null ? (item.brand as any).id : undefined;
  const brandSlug = typeof item.brand === 'object' && item.brand !== null ? (item.brand as any).slug : undefined;

  const categoryName =
    typeof item.category === 'object' && item.category !== null
      ? (item.category as any).name
      : item.category_name || String(item.category || '');
  const categoryId = typeof item.category === 'object' && item.category !== null ? (item.category as any).id : undefined;
  const categorySlug = typeof item.category === 'object' && item.category !== null ? (item.category as any).slug : undefined;

  const subcategoryName =
    typeof item.subcategory === 'object' && item.subcategory !== null
      ? (item.subcategory as any).name
      : item.subcategory_name || '';
  const subcategoryId = typeof item.subcategory === 'object' && item.subcategory !== null ? (item.subcategory as any).id : undefined;
  const subcategorySlug = typeof item.subcategory === 'object' && item.subcategory !== null ? (item.subcategory as any).slug : undefined;

  const normalizeImageUrl = (url?: string) => {
    if (!url) return '';
    if (url.startsWith('/media/')) {
      if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        return url;
      }
      if (import.meta.env.PROD) {
        const backendBase = import.meta.env.VITE_API_URL
          ? import.meta.env.VITE_API_URL.replace('/api/v1', '')
          : '';
        return `${backendBase}${url}`;
      }
      const backendBase = import.meta.env.VITE_API_URL
        ? import.meta.env.VITE_API_URL.replace('/api/v1', '')
        : 'http://localhost:8000';
      return `${backendBase}${url}`;
    }
    return url;
  };

  const detailImages = (item as ProductDetail).images;
  const validDetailImages = Array.isArray(detailImages) && detailImages.length > 0
    ? detailImages
        .map((img: any) => normalizeImageUrl(img.image || img.image_url))
        .filter((url) => !isInappropriateOrPlaceholderImage(url))
    : [];

  const resolvedPrimary = resolveProductImage({
    image: item.primary_image,
    category: item.category,
  });

  const imageList: string[] = validDetailImages.length > 0
    ? validDetailImages
    : [resolvedPrimary];

  const detailSpecs = (item as ProductDetail).specifications;
  const specsMap: Record<string, string> = {};
  if (Array.isArray(detailSpecs)) {
    detailSpecs.forEach((s) => {
      specsMap[s.key] = s.value;
    });
  }

  return {
    id: String(item.id),
    name: item.name,
    brand: brandName,
    brandId,
    brandSlug,
    category: categoryName,
    categoryId,
    categorySlug,
    subcategory: subcategoryName,
    subcategoryId,
    subcategorySlug,
    sku: item.sku,
    mrp: Number(item.mrp) || Number(item.price) || 0,
    price: Number(item.price) || 0,
    stock: item.stock !== undefined ? Number(item.stock) : item.in_stock ? 10 : 0,
    lowStockThreshold: item.low_stock_threshold !== undefined ? Number(item.low_stock_threshold) : 5,
    images: imageList,
    image: imageList[0],
    primary_image: resolvedPrimary,
    description: (item as ProductDetail).description || '',
    specifications: specsMap,
    tags: [],
    featured: Boolean(item.featured),
    active: Boolean(item.active),
  };
};

const mapApiCategoryToCategory = (item: ApiCategory | any): Category => {
  const subcats = Array.isArray(item.subcategories)
    ? item.subcategories.map((s: any) => (typeof s === 'string' ? s : s.name))
    : [];

  return {
    id: item.id,
    name: item.name,
    slug: item.slug || String(item.id),
    image: item.image || '',
    subtitle: item.subtitle || (subcats.length > 0 ? subcats.slice(0, 2).join(' • ') : 'Genuine Brands'),
    isActive: Boolean(item.is_active ?? item.isActive ?? true),
    is_active: Boolean(item.is_active ?? item.isActive ?? true),
    showInHero: Boolean(item.show_in_hero ?? item.showInHero ?? false),
    show_in_hero: Boolean(item.show_in_hero ?? item.showInHero ?? false),
    heroOrder: Number(item.hero_order ?? item.heroOrder ?? 99),
    hero_order: Number(item.hero_order ?? item.heroOrder ?? 99),
    heroBadge: item.hero_badge || item.heroBadge || '',
    hero_badge: item.hero_badge || item.heroBadge || '',
    discountEnabled: Boolean(item.discount_enabled ?? item.discountEnabled),
    discount_enabled: Boolean(item.discount_enabled ?? item.discountEnabled),
    discountType: (item.discount_type || item.discountType || 'percentage') as 'percentage' | 'fixed',
    discount_type: (item.discount_type || item.discountType || 'percentage') as 'percentage' | 'fixed',
    discountValue: Number(item.discount_value ?? item.discountValue ?? 0),
    discount_value: Number(item.discount_value ?? item.discountValue ?? 0),
    discountLabel: item.discount_label || item.discountLabel || '',
    discount_label: item.discount_label || item.discountLabel || '',
    productsCount: item.products_count !== undefined ? Number(item.products_count) : (item.product_count !== undefined ? Number(item.product_count) : undefined),
    products_count: item.products_count !== undefined ? Number(item.products_count) : (item.product_count !== undefined ? Number(item.product_count) : undefined),
    subcategories: subcats,
  };
};

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const MEMORY_CACHE_TTL_MS = 60 * 1000; // 60 seconds

let categoriesCache: CacheEntry<Category[]> | null = null;
let categoriesPendingPromise: Promise<Category[]> | null = null;

let heroCategoriesCache: CacheEntry<HeroCategory[]> | null = null;
let heroCategoriesPendingPromise: Promise<HeroCategory[]> | null = null;

let brandsCache: CacheEntry<string[]> | null = null;
let brandsPendingPromise: Promise<string[]> | null = null;

const productsCache = new Map<string, CacheEntry<Product[]>>();
const productsPendingPromises = new Map<string, Promise<Product[]>>();

const productDetailCache = new Map<string, CacheEntry<Product>>();
const productDetailPendingPromises = new Map<string, Promise<Product | undefined>>();

export const clearProductServiceCache = () => {
  categoriesCache = null;
  heroCategoriesCache = null;
  brandsCache = null;
  productsCache.clear();
  productsPendingPromises.clear();
  productDetailCache.clear();
  productDetailPendingPromises.clear();
};

if (typeof window !== 'undefined') {
  window.addEventListener('hero_categories_updated', clearProductServiceCache);
}

export const productService = {
  async getProducts(
    params?: {
      category?: string;
      brand?: string;
      search?: string;
      q?: string;
      min_price?: number;
      max_price?: number;
      featured?: boolean;
      ordering?: string;
      page?: number;
      page_size?: number;
    },
    options?: { forceRefresh?: boolean }
  ): Promise<Product[]> {
    const apiParams: ProductFilterParams = {
      category: params?.category,
      brand: params?.brand,
      search: params?.search || params?.q,
      min_price: params?.min_price,
      max_price: params?.max_price,
      featured: params?.featured,
      ordering: params?.ordering,
      page: params?.page,
      page_size: params?.page_size,
    };

    const cacheKey = JSON.stringify(apiParams);
    const now = Date.now();
    if (!options?.forceRefresh) {
      const cached = productsCache.get(cacheKey);
      if (cached && now - cached.timestamp < MEMORY_CACHE_TTL_MS) {
        return cached.data;
      }
      const pending = productsPendingPromises.get(cacheKey);
      if (pending) {
        return pending;
      }
    }

    const promise = (async () => {
      try {
        const res = await catalogApi.getProducts(apiParams);
        const results = Array.isArray(res) ? res : res.results || [];
        const mapped = results.map(mapApiProductToProduct);
        productsCache.set(cacheKey, { data: mapped, timestamp: Date.now() });
        return mapped;
      } finally {
        productsPendingPromises.delete(cacheKey);
      }
    })();

    productsPendingPromises.set(cacheKey, promise);
    return promise;
  },

  async getProductById(id: string | number, options?: { forceRefresh?: boolean }): Promise<Product | undefined> {
    const key = String(id);
    const now = Date.now();
    if (!options?.forceRefresh) {
      const cached = productDetailCache.get(key);
      if (cached && now - cached.timestamp < MEMORY_CACHE_TTL_MS) {
        return cached.data;
      }
      const pending = productDetailPendingPromises.get(key);
      if (pending) {
        return pending;
      }
    }

    const promise = (async () => {
      try {
        const detail = await catalogApi.getProductDetail(id);
        const mapped = mapApiProductToProduct(detail);
        productDetailCache.set(key, { data: mapped, timestamp: Date.now() });
        return mapped;
      } catch {
        return undefined;
      } finally {
        productDetailPendingPromises.delete(key);
      }
    })();

    productDetailPendingPromises.set(key, promise);
    return promise;
  },

  async getCategories(options?: { forceRefresh?: boolean }): Promise<Category[]> {
    const now = Date.now();
    if (!options?.forceRefresh && categoriesCache && now - categoriesCache.timestamp < MEMORY_CACHE_TTL_MS) {
      return categoriesCache.data;
    }

    if (categoriesPendingPromise) {
      return categoriesPendingPromise;
    }

    categoriesPendingPromise = (async () => {
      try {
        const res = await catalogApi.getCategories();
        const rawCategories: any[] = Array.isArray(res) ? res : res.results || [];
        const mapped = rawCategories.map(mapApiCategoryToCategory);
        categoriesCache = { data: mapped, timestamp: Date.now() };
        return mapped;
      } finally {
        categoriesPendingPromise = null;
      }
    })();

    return categoriesPendingPromise;
  },

  async getHeroCategories(options?: { forceRefresh?: boolean }): Promise<HeroCategory[]> {
    const now = Date.now();
    if (!options?.forceRefresh && heroCategoriesCache && now - heroCategoriesCache.timestamp < MEMORY_CACHE_TTL_MS) {
      return heroCategoriesCache.data;
    }

    if (heroCategoriesPendingPromise) {
      return heroCategoriesPendingPromise;
    }

    heroCategoriesPendingPromise = (async () => {
      try {
        const res = await catalogApi.getHeroCategories();
        const raw: any[] = Array.isArray(res) ? res : (res as any).results || [];

        const mapped = raw.map((item) => {
          const discountVal = Number(item.discount_value ?? item.discountValue ?? 0);
          const discountType = (item.discount_type || item.discountType || 'percentage') as 'percentage' | 'fixed';
          const discountEnabled = Boolean(item.discount_enabled ?? item.discountEnabled) && discountVal > 0;
          let discountLabel = (item.discount_label || item.discountLabel || '').trim();
          if (!discountLabel && discountEnabled) {
            discountLabel = discountType === 'fixed' ? `₹${discountVal} OFF` : `UP TO ${discountVal}% OFF`;
          }

          return {
            id: item.id,
            name: item.name,
            slug: item.slug || String(item.id),
            link: `/shop?category=${item.slug || item.id}`,
            image: item.image && !isInappropriateOrPlaceholderImage(item.image)
              ? item.image
              : getCategoryDefaultImage(item.slug || item.id || item.name),
            subtitle: item.subtitle || 'Genuine Brands',
            heroOrder: Number(item.hero_order ?? item.heroOrder ?? 99),
            heroBadge: item.hero_badge || item.heroBadge || '',
            discountEnabled,
            discountType,
            discountValue: discountVal,
            discountLabel,
          };
        }).sort((a, b) => a.heroOrder - b.heroOrder);

        heroCategoriesCache = { data: mapped, timestamp: Date.now() };
        return mapped;
      } finally {
        heroCategoriesPendingPromise = null;
      }
    })();

    return heroCategoriesPendingPromise;
  },

  async updateCategory(id: string | number, data: Partial<Category>): Promise<any> {
    const payload = {
      name: data.name,
      image: data.image,
      subtitle: data.subtitle,
      is_active: data.is_active ?? data.isActive,
      show_in_hero: data.show_in_hero ?? data.showInHero,
      hero_order: data.hero_order ?? data.heroOrder,
      hero_badge: data.hero_badge ?? data.heroBadge,
      discount_enabled: data.discount_enabled ?? data.discountEnabled,
      discount_type: data.discount_type ?? data.discountType,
      discount_value: data.discount_value ?? data.discountValue,
      discount_label: data.discount_label ?? data.discountLabel,
    };

    const updated = await catalogApi.updateCategory(id, payload);
    clearProductServiceCache();
    window.dispatchEvent(new CustomEvent('hero_categories_updated'));
    return updated;
  },

  async getBrands(options?: { forceRefresh?: boolean }): Promise<string[]> {
    const now = Date.now();
    if (!options?.forceRefresh && brandsCache && now - brandsCache.timestamp < MEMORY_CACHE_TTL_MS) {
      return brandsCache.data;
    }

    if (brandsPendingPromise) {
      return brandsPendingPromise;
    }

    brandsPendingPromise = (async () => {
      try {
        const res = await catalogApi.getBrands();
        const raw: any[] = Array.isArray(res) ? res : (res as any).results || [];
        const mapped = raw.map((b) => (typeof b === 'string' ? b : b.name));
        brandsCache = { data: mapped, timestamp: Date.now() };
        return mapped;
      } finally {
        brandsPendingPromise = null;
      }
    })();

    return brandsPendingPromise;
  },
};
