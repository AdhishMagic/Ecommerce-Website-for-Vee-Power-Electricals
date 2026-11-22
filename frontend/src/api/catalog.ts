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
  include_all?: boolean;
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

  async uploadProductImage(file: File): Promise<{ image_url: string; url: string; filename?: string }> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('image', file);
    return apiClient<{ image_url: string; url: string; filename?: string }>('/catalog/products/upload-image/', {
      method: 'POST',
      body: formData,
    });
  },

  async getDefaultImages(): Promise<Array<{ key: string; name: string; image_url: string }>> {
    return apiClient<Array<{ key: string; name: string; image_url: string }>>('/catalog/products/default-images/');
  },

  async downloadBulkImportTemplate(): Promise<Blob> {
    const blob = await apiClient<Blob>('/catalog/products/bulk-import/template/', {
      method: 'GET',
      responseType: 'blob',
    });
    // Trigger direct browser download
    if (typeof window !== 'undefined') {
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.setAttribute('download', 'VeePower_Products_Template.xlsx');
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    }
    return blob;
  },

  async bulkImportProductsMultipart(
    excelFile: File,
    imagesZip?: File | null
  ): Promise<{
    success: boolean;
    total_processed: number;
    created_count: number;
    updated_count: number;
    images_extracted_count?: number;
    images_extracted?: number;
    error_count: number;
    created: number;
    updated: number;
    errors: Array<{ row: number; sku: string; reason: string; error?: string }>;
    detail?: string;
  }> {
    const formData = new FormData();
    formData.append('excel_file', excelFile);
    formData.append('file', excelFile);
    if (imagesZip) {
      formData.append('images_zip', imagesZip);
      formData.append('zip_file', imagesZip);
    }
    return apiClient<{
      success: boolean;
      total_processed: number;
      created_count: number;
      updated_count: number;
      images_extracted_count?: number;
      images_extracted?: number;
      error_count: number;
      created: number;
      updated: number;
      errors: Array<{ row: number; sku: string; reason: string; error?: string }>;
      detail?: string;
    }>('/catalog/products/bulk-import/', {
      method: 'POST',
      body: formData,
    });
  },

  async bulkImportProducts(products: any[]): Promise<{
    success: boolean;
    created: number;
    updated: number;
    errors: Array<{ row: number; sku: string; error: string }>;
    total_processed: number;
  }> {
    return apiClient<{
      success: boolean;
      created: number;
      updated: number;
      errors: Array<{ row: number; sku: string; error: string }>;
      total_processed: number;
    }>('/catalog/products/bulk-import/', {
      method: 'POST',
      body: { products },
    });
  },
};

