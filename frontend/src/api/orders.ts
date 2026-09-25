import { apiClient } from './client';
import {
  CheckoutPayload,
  OrderDetailData,
  OrderSummary,
  OrderStatus,
  OrderStatusHistoryItem,
  PaginatedResponse,
} from '../types/api';

export const ordersApi = {
  async checkout(payload: CheckoutPayload): Promise<OrderDetailData> {
    return apiClient<OrderDetailData>('/orders/checkout/', {
      method: 'POST',
      body: payload,
    });
  },

  async getMyOrders(params?: { page?: number; page_size?: number }): Promise<PaginatedResponse<OrderSummary>> {
    return apiClient<PaginatedResponse<OrderSummary>>('/orders/my-orders/', { params });
  },

  async getOrderDetail(id: number | string): Promise<OrderDetailData> {
    return apiClient<OrderDetailData>(`/orders/${id}/`);
  },

  async getOrderHistory(id: number | string): Promise<OrderStatusHistoryItem[]> {
    const res = await apiClient<PaginatedResponse<OrderStatusHistoryItem> | OrderStatusHistoryItem[]>(`/orders/${id}/history/`);
    return Array.isArray(res) ? res : res.results || [];
  },

  async getAdminOrders(params?: {
    status?: OrderStatus;
    payment_status?: string;
    search?: string;
    q?: string;
    page?: number;
    page_size?: number;
  }): Promise<PaginatedResponse<OrderSummary>> {
    return apiClient<PaginatedResponse<OrderSummary>>('/orders/', { params });
  },

  async updateOrderStatus(
    id: number | string,
    status: OrderStatus,
    reason: string = ''
  ): Promise<OrderDetailData> {
    return apiClient<OrderDetailData>(`/orders/${id}/status/`, {
      method: 'PATCH',
      body: { status, reason },
    });
  },
};
