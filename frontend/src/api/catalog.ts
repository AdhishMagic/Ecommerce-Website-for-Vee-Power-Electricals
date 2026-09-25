import { apiClient } from './client';
import {
  Category,
  Subcategory,
  Brand,
  ProductSummary,
  ProductDetail,
  PaginatedResponse,
} from '../types/api';

export interface ProductFilterParams {
  category?: string | number;
  category_slug?: string;
  brand?: string | number;
  brand_slug?: string;
  min_price?: number | string;
  max_price?: number | string;
  featured?: boolean;
  active?: boolean;
  q?: string;
  search?: string;
  ordering?: string;
  page?: number;
  page_size?: number;
}

export const catalogApi = {
  // Categories
  async getCategories(params?: { show_in_hero?: boolean; page?: number; page_size?: number }): Promise<PaginatedResponse<Category> | Category[]> {
    return apiClient<PaginatedResponse<Category> | Category[]>('/catalog/categories/', { params });
  },

  async getHeroCategories(): Promise<Category[]> {
    return apiClient<Category[]>('/catalog/categories/hero/');
  },

  async getCategoryDetail(id: number | string): Promise<Category> {
    return apiClient<Category>(`/catalog/categories/${id}/`);
  },

  async createCategory(data: Partial<Category>): Promise<Category> {
    return apiClient<Category>('/catalog/categories/', {
      method: 'POST',
      body: data,
    });
  },

  async updateCategory(id: number | string, data: Partial<Category>): Promise<Category> {
    return apiClient<Category>(`/catalog/categories/${id}/`, {
      method: 'PATCH',
      body: data,
    });
  },

  async deleteCategory(id: number | string): Promise<void> {
    return apiClient<void>(`/catalog/categories/${id}/`, {
      method: 'DELETE',
    });
  },

  // Subcategories
  async getSubcategories(params?: { category?: string | number }): Promise<PaginatedResponse<Subcategory> | Subcategory[]> {
    return apiClient<PaginatedResponse<Subcategory> | Subcategory[]>('/catalog/subcategories/', { params });
  },

  async getSubcategoryDetail(id: number | string): Promise<Subcategory> {
    return apiClient<Subcategory>(`/catalog/subcategories/${id}/`);
  },

  // Brands
  async getBrands(): Promise<PaginatedResponse<Brand> | Brand[]> {
    return apiClient<PaginatedResponse<Brand> | Brand[]>('/catalog/brands/');
  },

  async getBrandDetail(id: number | string): Promise<Brand> {
    return apiClient<Brand>(`/catalog/brands/${id}/`);
  },

  // Products
  async getProducts(params?: ProductFilterParams): Promise<PaginatedResponse<ProductSummary>> {
    return apiClient<PaginatedResponse<ProductSummary>>('/catalog/products/', { params });
  },

  async getProductDetail(idOrSlug: string | number): Promise<ProductDetail> {
    return apiClient<ProductDetail>(`/catalog/products/${idOrSlug}/`);
  },

  async createProduct(data: any): Promise<ProductDetail> {
    return apiClient<ProductDetail>('/catalog/products/', {
      method: 'POST',
      body: data,
    });
  },

  async updateProduct(id: number | string, data: any): Promise<ProductDetail> {
    return apiClient<ProductDetail>(`/catalog/products/${id}/`, {
      method: 'PATCH',
      body: data,
    });
  },

  async deleteProduct(id: number | string): Promise<{ deactivated?: boolean; detail?: string } | void> {
    return apiClient<{ deactivated?: boolean; detail?: string } | void>(`/catalog/products/${id}/`, {
      method: 'DELETE',
    });
  },
};
