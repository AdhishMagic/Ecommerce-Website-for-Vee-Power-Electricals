import { apiClient } from './client';
import {
  ClientItem,
  Quotation,
  Invoice,
  PaymentTransaction,
  PayoutSettlement,
  PaginatedResponse,
} from '../types/api';

export const financeApi = {
  // Clients
  async getClients(params?: { search?: string; q?: string; page?: number }): Promise<ClientItem[]> {
    const res = await apiClient<PaginatedResponse<ClientItem> | ClientItem[]>('/finance/clients/', { params });
    return Array.isArray(res) ? res : res.results || [];
  },

  async getClientDetail(id: number | string): Promise<ClientItem> {
    return apiClient<ClientItem>(`/finance/clients/${id}/`);
  },

  async createClient(data: Partial<ClientItem>): Promise<ClientItem> {
    return apiClient<ClientItem>('/finance/clients/', {
      method: 'POST',
      body: data,
    });
  },

  async updateClient(id: number | string, data: Partial<ClientItem>): Promise<ClientItem> {
    return apiClient<ClientItem>(`/finance/clients/${id}/`, {
      method: 'PATCH',
      body: data,
    });
  },

  async deleteClient(id: number | string): Promise<void> {
    return apiClient<void>(`/finance/clients/${id}/`, {
      method: 'DELETE',
    });
  },

  // Quotations
  async getQuotations(params?: { client?: number | string; status?: string; page?: number }): Promise<Quotation[]> {
    const res = await apiClient<PaginatedResponse<Quotation> | Quotation[]>('/finance/quotations/', { params });
    return Array.isArray(res) ? res : res.results || [];
  },

  async getQuotationDetail(id: number | string): Promise<Quotation> {
    return apiClient<Quotation>(`/finance/quotations/${id}/`);
  },

  async createQuotation(data: any): Promise<Quotation> {
    return apiClient<Quotation>('/finance/quotations/', {
      method: 'POST',
      body: data,
    });
  },

  async updateQuotation(id: number | string, data: any): Promise<Quotation> {
    return apiClient<Quotation>(`/finance/quotations/${id}/`, {
      method: 'PATCH',
      body: data,
    });
  },

  async updateQuotationStatus(id: number | string, status: string): Promise<Quotation> {
    return apiClient<Quotation>(`/finance/quotations/${id}/status/`, {
      method: 'PATCH',
      body: { status },
    });
  },

  async convertQuotationToInvoice(id: number | string, notes?: string): Promise<Invoice> {
    return apiClient<Invoice>(`/finance/quotations/${id}/convert/`, {
      method: 'POST',
      body: { notes },
    });
  },

  async deleteQuotation(id: number | string): Promise<void> {
    return apiClient<void>(`/finance/quotations/${id}/`, {
      method: 'DELETE',
    });
  },

  // Invoices
  async getInvoices(params?: { client?: number | string; status?: string; page?: number }): Promise<Invoice[]> {
    const res = await apiClient<PaginatedResponse<Invoice> | Invoice[]>('/finance/invoices/', { params });
    return Array.isArray(res) ? res : res.results || [];
  },

  async getInvoiceDetail(id: number | string): Promise<Invoice> {
    return apiClient<Invoice>(`/finance/invoices/${id}/`);
  },

  async createInvoice(data: any): Promise<Invoice> {
    return apiClient<Invoice>('/finance/invoices/', {
      method: 'POST',
      body: data,
    });
  },

  async updateInvoice(id: number | string, data: any): Promise<Invoice> {
    return apiClient<Invoice>(`/finance/invoices/${id}/`, {
      method: 'PATCH',
      body: data,
    });
  },

  async updateInvoiceStatus(id: number | string, status: string): Promise<Invoice> {
    return apiClient<Invoice>(`/finance/invoices/${id}/status/`, {
      method: 'PATCH',
      body: { status },
    });
  },

  async deleteInvoice(id: number | string): Promise<void> {
    return apiClient<void>(`/finance/invoices/${id}/`, {
      method: 'DELETE',
    });
  },

  // Payments & Settlements
  async getPayments(params?: { order?: number | string; invoice?: number | string; page?: number }): Promise<PaymentTransaction[]> {
    const res = await apiClient<PaginatedResponse<PaymentTransaction> | PaymentTransaction[]>('/finance/payments/', { params });
    return Array.isArray(res) ? res : res.results || [];
  },

  async getSettlements(params?: { page?: number }): Promise<PayoutSettlement[]> {
    const res = await apiClient<PaginatedResponse<PayoutSettlement> | PayoutSettlement[]>('/finance/settlements/', { params });
    return Array.isArray(res) ? res : res.results || [];
  },
};
