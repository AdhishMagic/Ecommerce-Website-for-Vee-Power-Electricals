export interface Product {
  id: string;
  name: string;
  brand: string;
  brandId?: number | string;
  brandSlug?: string;
  category: string;
  categoryId?: number | string;
  categorySlug?: string;
  subcategory: string;
  subcategoryId?: number | string;
  subcategorySlug?: string;
  sku: string;
  mrp: number;
  price: number;
  stock: number;
  lowStockThreshold: number;
  images: string[];
  image?: string;
  primary_image?: string;
  description: string;
  specifications: Record<string, string>;
  tags: string[];
  featured: boolean;
  active: boolean;
}

export interface Category {
  id: string | number;
  name: string;
  slug?: string;
  icon?: string;
  image?: string;
  subtitle?: string;
  isActive?: boolean;
  is_active?: boolean;
  showInHero?: boolean;
  show_in_hero?: boolean;
  heroOrder?: number;
  hero_order?: number;
  heroBadge?: string;
  hero_badge?: string;
  discountEnabled?: boolean;
  discount_enabled?: boolean;
  discountType?: 'percentage' | 'fixed';
  discount_type?: 'percentage' | 'fixed';
  discountValue?: number | string;
  discount_value?: number | string;
  discountLabel?: string;
  discount_label?: string;
  productsCount?: number;
  products_count?: number;
  subcategories: string[];
}

export interface HeroCategory {
  id: string | number;
  name: string;
  slug: string;
  link: string;
  image: string;
  subtitle: string;
  heroOrder: number;
  heroBadge?: string;
  discountEnabled: boolean;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  discountLabel: string;
}
