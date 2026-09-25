import { apiClient } from './client';
import { CustomerAddress, PaginatedResponse } from '../types/api';

export const addressesApi = {
  async getAddresses(): Promise<CustomerAddress[]> {
    const res = await apiClient<PaginatedResponse<CustomerAddress> | CustomerAddress[]>('/addresses/');
    return Array.isArray(res) ? res : res.results || [];
  },

  async getAddress(id: number | string): Promise<CustomerAddress> {
    return apiClient<CustomerAddress>(`/addresses/${id}/`);
  },

  async createAddress(data: Omit<CustomerAddress, 'id' | 'created_at' | 'updated_at'>): Promise<CustomerAddress> {
    return apiClient<CustomerAddress>('/addresses/', {
      method: 'POST',
      body: data,
    });
  },

  async updateAddress(id: number | string, data: Partial<CustomerAddress>): Promise<CustomerAddress> {
    return apiClient<CustomerAddress>(`/addresses/${id}/`, {
      method: 'PATCH',
      body: data,
    });
  },

  async deleteAddress(id: number | string): Promise<void> {
    return apiClient<void>(`/addresses/${id}/`, {
      method: 'DELETE',
    });
  },

  async setDefaultAddress(id: number | string): Promise<{ message: string; address: CustomerAddress }> {
    return apiClient<{ message: string; address: CustomerAddress }>(`/addresses/${id}/set-default/`, {
      method: 'POST',
    });
  },
};
