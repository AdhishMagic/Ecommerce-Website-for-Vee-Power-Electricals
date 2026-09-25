import { Product, Category, HeroCategory } from '../types/product';
import { catalogApi, ProductFilterParams } from '../api/catalog';
import { ProductSummary, ProductDetail, Category as ApiCategory } from '../types/api';

const mapApiProductToProduct = (item: ProductSummary | ProductDetail): Product => {
  const brandName =
    typeof item.brand === 'object' && item.brand !== null
      ? (item.brand as any).name
      : item.brand_name || String(item.brand || '');

  const categoryName =
    typeof item.category === 'object' && item.category !== null
      ? (item.category as any).name
      : item.category_name || String(item.category || '');

  const subcategoryName =
    typeof item.subcategory === 'object' && item.subcategory !== null
      ? (item.subcategory as any).name
      : item.subcategory_name || '';

  const detailImages = (item as ProductDetail).images;
  const imageList: string[] = Array.isArray(detailImages) && detailImages.length > 0
    ? detailImages.map((img) => img.image)
    : item.primary_image
    ? [item.primary_image]
    : ['https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&h=600&fit=crop'];

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
    category: categoryName,
    subcategory: subcategoryName,
    sku: item.sku,
    mrp: Number(item.mrp) || Number(item.price) || 0,
    price: Number(item.price) || 0,
    stock: item.stock !== undefined ? Number(item.stock) : item.in_stock ? 10 : 0,
    lowStockThreshold: item.low_stock_threshold !== undefined ? Number(item.low_stock_threshold) : 5,
    images: imageList,
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
    subcategories: subcats,
  };
};

export const productService = {
  async getProducts(params?: {
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
  }): Promise<Product[]> {
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

    const res = await catalogApi.getProducts(apiParams);
    const results = Array.isArray(res) ? res : res.results || [];
    return results.map(mapApiProductToProduct);
  },

  async getProductById(id: string | number): Promise<Product | undefined> {
    try {
      const detail = await catalogApi.getProductDetail(id);
      return mapApiProductToProduct(detail);
    } catch {
      return undefined;
    }
  },

  async getCategories(): Promise<Category[]> {
    const res = await catalogApi.getCategories();
    const rawCategories: any[] = Array.isArray(res) ? res : res.results || [];
    return rawCategories.map(mapApiCategoryToCategory);
  },

  async getHeroCategories(): Promise<HeroCategory[]> {
    const res = await catalogApi.getHeroCategories();
    const raw: any[] = Array.isArray(res) ? res : (res as any).results || [];

    return raw.map((item) => {
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
        image: item.image || 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=400&fit=crop',
        subtitle: item.subtitle || 'Genuine Brands',
        heroOrder: Number(item.hero_order ?? item.heroOrder ?? 99),
        heroBadge: item.hero_badge || item.heroBadge || '',
        discountEnabled,
        discountType,
        discountValue: discountVal,
        discountLabel,
      };
    }).sort((a, b) => a.heroOrder - b.heroOrder);
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
    window.dispatchEvent(new CustomEvent('hero_categories_updated'));
    return updated;
  },

  async getBrands(): Promise<string[]> {
    const res = await catalogApi.getBrands();
    const raw: any[] = Array.isArray(res) ? res : (res as any).results || [];
    return raw.map((b) => (typeof b === 'string' ? b : b.name));
  },
};
