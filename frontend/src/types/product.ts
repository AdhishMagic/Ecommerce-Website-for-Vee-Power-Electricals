export interface Product {
  id: string;
  name: string;
  brand: string;
  category: string;
  subcategory: string;
  sku: string;
  mrp: number;
  price: number;
  stock: number;
  lowStockThreshold: number;
  images: string[];
  description: string;
  specifications: Record<string, string>;
  tags: string[];
  featured: boolean;
  active: boolean;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  subcategories: string[];
}
