import { apiClient } from './client';
import {
  ClientItem,
  Quotation,
  Invoice,
  PaymentTransaction,
  PayoutSettlement,
  ExpenseItem,
  PaginatedResponse,
} from '../types/api';

/**
 * Database-wide aggregates for admin KPI cards.
 *
 * Every value here is computed by the backend over the complete table. Admin KPI
 * cards must read these instead of summing the current paginated page, otherwise
 * the displayed totals silently under-report as soon as a table exceeds one page.
 */
export interface StatusAggregate {
  count: number;
  amount?: string;
  value?: string;
}

export interface ClientsSummary {
  total_count: number;
  active_count: number;
  inactive_count: number;
  total_credit_limit: string;
  total_exposure: string;
}

export interface QuotationsSummary {
  total_count: number;
  total_value: string;
  pending_count: number;
  converted_count: number;
  approved_count: number;
  rejected_count: number;
  by_status: Record<string, StatusAggregate>;
}

export interface InvoicesSummary {
  total_count: number;
  total_invoiced: string;
  total_collected: string;
  total_outstanding: string;
  by_status: Record<string, StatusAggregate>;
}

export interface ExpensesSummary {
  total_count: number;
  total_amount: string;
  pending_count: number;
  pending_amount: string;
  by_category: Record<string, StatusAggregate>;
  by_status: Record<string, StatusAggregate>;
}

export interface PaymentsSummary {
  total_count: number;
  total_collected: string;
  success_count: number;
  failed_count: number;
  initiated_count: number;
  refunded_count: number;
  by_status: Record<string, StatusAggregate>;
}

export const financeApi = {
  // Database-wide aggregates (never derived from a paginated page)
  async getClientsSummary(): Promise<ClientsSummary> {
    return apiClient<ClientsSummary>('/finance/clients/summary/');
  },

  async getQuotationsSummary(): Promise<QuotationsSummary> {
    return apiClient<QuotationsSummary>('/finance/quotations/summary/');
  },

  async getInvoicesSummary(): Promise<InvoicesSummary> {
    return apiClient<InvoicesSummary>('/finance/invoices/summary/');
  },

  async getExpensesSummary(): Promise<ExpensesSummary> {
    return apiClient<ExpensesSummary>('/expenses/summary/');
  },

  async getPaymentsSummary(): Promise<PaymentsSummary> {
    return apiClient<PaymentsSummary>('/finance/payments/summary/');
  },

  // Paginated list variants. These preserve the backend `count`/`page`/`total_pages`
  // envelope so admin tables can paginate on the server instead of silently showing
  // only the first page of a large table.
  async getClientsPaginated(params?: {
    search?: string;
    is_active?: boolean | string;
    page?: number;
    page_size?: number;
  }): Promise<PaginatedResponse<ClientItem>> {
    return apiClient<PaginatedResponse<ClientItem>>('/finance/clients/', { params });
  },

  async getQuotationsPaginated(params?: {
    client?: number | string;
    status?: string;
    search?: string;
    page?: number;
    page_size?: number;
  }): Promise<PaginatedResponse<Quotation>> {
    return apiClient<PaginatedResponse<Quotation>>('/finance/quotations/', { params });
  },

  async getInvoicesPaginated(params?: {
    client?: number | string;
    order?: number | string;
    status?: string;
    search?: string;
    start_date?: string;
    end_date?: string;
    page?: number;
    page_size?: number;
  }): Promise<PaginatedResponse<Invoice>> {
    return apiClient<PaginatedResponse<Invoice>>('/finance/invoices/', { params });
  },

  async getExpensesPaginated(params?: {
    category?: string;
    status?: string;
    search?: string;
    start_date?: string;
    end_date?: string;
    page?: number;
    page_size?: number;
  }): Promise<PaginatedResponse<ExpenseItem>> {
    return apiClient<PaginatedResponse<ExpenseItem>>('/expenses/', { params });
  },

  async getPaymentsPaginated(params?: {
    order?: number | string;
    invoice?: number | string;
    status?: string;
    gateway?: string;
    page?: number;
    page_size?: number;
  }): Promise<PaginatedResponse<PaymentTransaction>> {
    return apiClient<PaginatedResponse<PaymentTransaction>>('/finance/payments/', { params });
  },

  // Clients
  async getClients(params?: { search?: string; q?: string; is_active?: boolean | string; page?: number }): Promise<ClientItem[]> {
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

  async getClientCredit(id: number | string): Promise<any> {
    return apiClient<any>(`/finance/clients/${id}/credit/`);
  },

  async adjustCreditLimit(id: number | string, credit_limit: number | string, reason?: string): Promise<ClientItem> {
    return apiClient<ClientItem>(`/finance/clients/${id}/credit-limit/`, {
      method: 'PATCH',
      body: { credit_limit, reason },
    });
  },

  async activateClient(id: number | string, reason?: string): Promise<ClientItem> {
    return apiClient<ClientItem>(`/finance/clients/${id}/activate/`, {
      method: 'POST',
      body: { reason },
    });
  },

  async deactivateClient(id: number | string, reason?: string): Promise<ClientItem> {
    return apiClient<ClientItem>(`/finance/clients/${id}/deactivate/`, {
      method: 'POST',
      body: { reason },
    });
  },

  async getClientQuotations(id: number | string): Promise<Quotation[]> {
    const res = await apiClient<PaginatedResponse<Quotation> | Quotation[]>(`/finance/clients/${id}/quotations/`);
    return Array.isArray(res) ? res : res.results || [];
  },

  async getClientInvoices(id: number | string): Promise<Invoice[]> {
    const res = await apiClient<PaginatedResponse<Invoice> | Invoice[]>(`/finance/clients/${id}/invoices/`);
    return Array.isArray(res) ? res : res.results || [];
  },

  async getClientPayments(id: number | string): Promise<PaymentTransaction[]> {
    const res = await apiClient<PaginatedResponse<PaymentTransaction> | PaymentTransaction[]>(`/finance/clients/${id}/payments/`);
    return Array.isArray(res) ? res : res.results || [];
  },

  async getClientAuditHistory(id: number | string): Promise<any[]> {
    return apiClient<any[]>(`/finance/clients/${id}/audit-history/`);
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

  async recordInvoicePayment(id: number | string, data: { amount: number | string; payment_method?: string; gateway?: string; notes?: string }): Promise<PaymentTransaction> {
    return apiClient<PaymentTransaction>(`/finance/invoices/${id}/record-payment/`, {
      method: 'POST',
      body: data,
    });
  },

  async getInvoicePayments(id: number | string): Promise<PaymentTransaction[]> {
    return apiClient<PaymentTransaction[]>(`/finance/invoices/${id}/payments/`);
  },

  // Reporting Summary
  async getFinanceSummary(params?: { filter_type?: string; start_date?: string; end_date?: string }): Promise<any> {
    return apiClient<any>('/finance/summary/', { params });
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

  // Expenses
  async getExpenses(params?: { category?: string; status?: string; search?: string; page?: number }): Promise<ExpenseItem[]> {
    const res = await apiClient<PaginatedResponse<ExpenseItem> | ExpenseItem[]>('/expenses/', { params });
    return Array.isArray(res) ? res : res.results || [];
  },

  async getExpenseDetail(id: number | string): Promise<ExpenseItem> {
    return apiClient<ExpenseItem>(`/expenses/${id}/`);
  },

  async createExpense(data: Partial<ExpenseItem>): Promise<ExpenseItem> {
    return apiClient<ExpenseItem>('/expenses/', {
      method: 'POST',
      body: data,
    });
  },

  async updateExpense(id: number | string, data: Partial<ExpenseItem>): Promise<ExpenseItem> {
    return apiClient<ExpenseItem>(`/expenses/${id}/`, {
      method: 'PATCH',
      body: data,
    });
  },

  async deleteExpense(id: number | string): Promise<void> {
    return apiClient<void>(`/expenses/${id}/`, {
      method: 'DELETE',
    });
  },
};
