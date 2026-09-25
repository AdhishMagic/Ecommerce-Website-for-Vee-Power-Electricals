import { apiClient } from './client';
import { InquiryPayload, InquiryItem, PaginatedResponse } from '../types/api';

export const inquiriesApi = {
  async submitInquiry(payload: InquiryPayload): Promise<InquiryItem> {
    return apiClient<InquiryItem>('/inquiries/', {
      method: 'POST',
      body: payload,
      skipAuth: true,
    });
  },

  async getAdminInquiries(params?: {
    status?: string;
    search?: string;
    q?: string;
    page?: number;
  }): Promise<PaginatedResponse<InquiryItem>> {
    return apiClient<PaginatedResponse<InquiryItem>>('/inquiries/', { params });
  },

  async getInquiryDetail(id: number | string): Promise<InquiryItem> {
    return apiClient<InquiryItem>(`/inquiries/${id}/`);
  },

  async updateInquiry(id: number | string, data: { status?: string; admin_notes?: string }): Promise<InquiryItem> {
    return apiClient<InquiryItem>(`/inquiries/${id}/`, {
      method: 'PATCH',
      body: data,
    });
  },

  async deleteInquiry(id: number | string): Promise<void> {
    return apiClient<void>(`/inquiries/${id}/`, {
      method: 'DELETE',
    });
  },
};
