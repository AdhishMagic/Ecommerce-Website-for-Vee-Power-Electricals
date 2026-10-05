import { apiClient } from './client';
import {
  Customer,
  CustomerDetail,
  CustomerSummary,
  CustomerFilters,
  CustomerCreateInput,
  CustomerUpdateInput,
  PaginatedResponse,
} from '../types/api';

export const customersApi = {
  /**
   * Retrieves a paginated list of customers with server-side search, filtering, and ordering.
   */
  async getCustomers(filters: CustomerFilters = {}): Promise<PaginatedResponse<Customer>> {
    const params: Record<string, any> = {};

    if (filters.search && filters.search.trim()) {
      params.search = filters.search.trim();
    }
    if (filters.status && filters.status !== 'all') {
      params.status = filters.status;
    }
    if (filters.customer_type && filters.customer_type !== 'all') {
      params.customer_type = filters.customer_type;
    }
    if (filters.ordering) {
      params.ordering = filters.ordering;
    }
    if (filters.page) {
      params.page = filters.page;
    }
    if (filters.page_size) {
      params.page_size = filters.page_size;
    }
    if (filters.from_date) {
      params.from_date = filters.from_date;
    }
    if (filters.to_date) {
      params.to_date = filters.to_date;
    }

    return apiClient<PaginatedResponse<Customer>>('/customers/', {
      method: 'GET',
      params,
    });
  },

  /**
   * Retrieves database-wide summary metrics for customers.
   */
  async getCustomerSummary(): Promise<CustomerSummary> {
    return apiClient<CustomerSummary>('/customers/summary/', {
      method: 'GET',
    });
  },

  /**
   * Retrieves complete profile, address book, order summary, and ledger for a single customer.
   */
  async getCustomerDetail(id: number | string): Promise<CustomerDetail> {
    return apiClient<CustomerDetail>(`/customers/${id}/`, {
      method: 'GET',
    });
  },

  /**
   * Creates a new customer account with optional initial address.
   */
  async createCustomer(data: CustomerCreateInput): Promise<CustomerDetail> {
    return apiClient<CustomerDetail>('/customers/', {
      method: 'POST',
      body: data,
    });
  },

  /**
   * Updates existing customer profile fields.
   */
  async updateCustomer(id: number | string, data: CustomerUpdateInput): Promise<CustomerDetail> {
    return apiClient<CustomerDetail>(`/customers/${id}/`, {
      method: 'PATCH',
      body: data,
    });
  },

  /**
   * Safely deletes or deactivates a customer account based on transaction dependencies.
   */
  async deleteCustomer(id: number | string): Promise<{ action: string; message: string; customer_id?: number }> {
    return apiClient<{ action: string; message: string; customer_id?: number }>(`/customers/${id}/`, {
      method: 'DELETE',
    });
  },

  /**
   * Toggles or sets customer active status.
   */
  async toggleCustomerStatus(id: number | string, isActive?: boolean): Promise<CustomerDetail> {
    return apiClient<CustomerDetail>(`/customers/${id}/status/`, {
      method: 'POST',
      body: isActive !== undefined ? { is_active: isActive } : {},
    });
  },
};
