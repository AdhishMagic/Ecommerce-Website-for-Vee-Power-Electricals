import { Product, Category } from '../types/product';
import { products as mockProducts, categories as mockCategories, brands as mockBrands } from '../data/mock/products';
import { apiFetch } from './api';

export const productService = {
  async getProducts(params?: { category?: string; brand?: string; search?: string }): Promise<Product[]> {
    try {
      const query = new URLSearchParams(params as Record<string, string>).toString();
      return await apiFetch<Product[]>(`/products/${query ? `?${query}` : ''}`);
    } catch {
      // Fallback to mock data if API is not running
      let result = [...mockProducts];
      if (params?.category) {
        result = result.filter(p => p.category === params.category);
      }
      if (params?.brand) {
        result = result.filter(p => p.brand === params.brand);
      }
      if (params?.search) {
        const term = params.search.toLowerCase();
        result = result.filter(p => p.name.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term));
      }
      return result;
    }
  },

  async getProductById(id: string): Promise<Product | undefined> {
    try {
      return await apiFetch<Product>(`/products/${id}/`);
    } catch {
      return mockProducts.find(p => p.id === id);
    }
  },

  async getCategories(): Promise<Category[]> {
    try {
      const res = await apiFetch<any>('/categories/');
      const rawCategories: Category[] = Array.isArray(res) ? res : res.results || [];
      return rawCategories;
    } catch {
      return mockCategories;
    }
  },

  async getHeroCategories(): Promise<HeroCategory[]> {
    try {
      const res = await apiFetch<any>('/categories/hero/');
      const raw: any[] = res.categories || (Array.isArray(res) ? res : res.results || []);
      
      if (raw && raw.length > 0) {
        return raw.map((item) => {
          const discountVal = Number(item.discountValue ?? item.discount_value ?? 0);
          const discountType = (item.discountType || item.discount_type || 'percentage') as 'percentage' | 'fixed';
          const discountEnabled = Boolean(item.discountEnabled ?? item.discount_enabled) && discountVal > 0;
          let discountLabel = (item.discountLabel || item.discount_label || '').trim();
          if (!discountLabel && discountEnabled) {
            discountLabel = discountType === 'fixed' ? `₹${discountVal} OFF` : `UP TO ${discountVal}% OFF`;
          }

          return {
            id: item.id,
            name: item.name,
            slug: item.slug || String(item.id),
            link: `/shop?category=${item.slug || item.id}`,
            image: item.image || 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=400&fit=crop',
            subtitle: item.subtitle || (Array.isArray(item.subcategories) ? item.subcategories.slice(0, 2).join(' • ') : 'Genuine Brands'),
            heroOrder: Number(item.heroOrder ?? item.hero_order ?? 99),
            heroBadge: item.heroBadge || item.hero_badge || '',
            discountEnabled,
            discountType,
            discountValue: discountVal,
            discountLabel,
          };
        }).sort((a, b) => a.heroOrder - b.heroOrder);
      }
    } catch {
      // Fallback below
    }

    // Check localStorage cache from admin
    try {
      const cached = localStorage.getItem('admin_hero_categories');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {
      // ignore
    }

    // Default Fallback Hero Categories
    return [
      {
        id: 1,
        name: "Ceiling Fans",
        slug: "fans",
        link: "/shop?category=fans",
        image: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=400&fit=crop",
        subtitle: "Havells • Crompton",
        heroOrder: 1,
        heroBadge: "Air Comfort",
        discountEnabled: true,
        discountType: "percentage",
        discountValue: 20,
        discountLabel: "UP TO 20% OFF",
      },
      {
        id: 4,
        name: "LED Lighting",
        slug: "lighting",
        link: "/shop?category=lighting",
        image: "https://images.unsplash.com/photo-1550985616-10810253b84d?w=400&h=400&fit=crop",
        subtitle: "Philips • Syska",
        heroOrder: 2,
        heroBadge: "Energy Saver",
        discountEnabled: true,
        discountType: "percentage",
        discountValue: 25,
        discountLabel: "UP TO 25% OFF",
      },
      {
        id: 2,
        name: "Wires & Cables",
        slug: "wires",
        link: "/shop?category=wires",
        image: "https://images.unsplash.com/photo-1621905251918-48416bd8575a?w=400&h=400&fit=crop",
        subtitle: "Polycab • Finolex",
        heroOrder: 3,
        heroBadge: "Fire Resistant",
        discountEnabled: false,
        discountType: "percentage",
        discountValue: 0,
        discountLabel: "",
      },
      {
        id: 3,
        name: "LED Panels & Switches",
        slug: "switches",
        link: "/shop?category=switches",
        image: "https://images.unsplash.com/photo-1497366216548-37526070297c?w=400&h=400&fit=crop",
        subtitle: "Modular & Smart",
        heroOrder: 4,
        heroBadge: "Slim Trim",
        discountEnabled: true,
        discountType: "fixed",
        discountValue: 150,
        discountLabel: "₹150 OFF",
      },
    ];
  },

  async updateCategory(id: string | number, data: Partial<Category>): Promise<any> {
    try {
      const updated = await apiFetch<any>(`/categories/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      // Notify listeners (homepage hero)
      window.dispatchEvent(new CustomEvent('hero_categories_updated'));
      return updated;
    } catch (err) {
      // In offline/mock mode, save to localStorage
      try {
        const cached = localStorage.getItem('admin_hero_categories_overrides') || '{}';
        const overrides = JSON.parse(cached);
        overrides[id] = { ...(overrides[id] || {}), ...data };
        localStorage.setItem('admin_hero_categories_overrides', JSON.stringify(overrides));
        window.dispatchEvent(new CustomEvent('hero_categories_updated'));
      } catch {}
      throw err;
    }
  },

  async getBrands(): Promise<string[]> {
    try {
      return await apiFetch<string[]>('/brands/');
    } catch {
      return mockBrands;
    }
  }
};
