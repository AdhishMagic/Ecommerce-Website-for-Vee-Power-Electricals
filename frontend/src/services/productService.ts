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
      return await apiFetch<Category[]>('/categories/');
    } catch {
      return mockCategories;
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
