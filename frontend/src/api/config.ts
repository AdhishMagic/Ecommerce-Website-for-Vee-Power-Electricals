import { apiClient } from './client';
import {
  StoreProfile,
  DeliveryConfiguration,
  DistanceSlab,
  CouponValidationResult,
  PaginatedResponse,
} from '../types/api';

export const configApi = {
  // Store Profile
  async getStoreProfile(): Promise<StoreProfile> {
    return apiClient<StoreProfile>('/config/store/');
  },

  async updateStoreProfile(data: Partial<StoreProfile>): Promise<StoreProfile> {
    return apiClient<StoreProfile>('/config/store/', {
      method: 'PATCH',
      body: data,
    });
  },

  // Delivery Configuration
  async getDeliveryConfig(): Promise<DeliveryConfiguration[]> {
    const res = await apiClient<PaginatedResponse<DeliveryConfiguration> | DeliveryConfiguration[]>('/config/delivery/');
    return Array.isArray(res) ? res : res.results || [];
  },

  async updateDeliveryConfig(id: number | string, data: Partial<DeliveryConfiguration>): Promise<DeliveryConfiguration> {
    return apiClient<DeliveryConfiguration>(`/config/delivery/${id}/`, {
      method: 'PATCH',
      body: data,
    });
  },

  // Distance Slabs
  async getDistanceSlabs(): Promise<DistanceSlab[]> {
    const res = await apiClient<PaginatedResponse<DistanceSlab> | DistanceSlab[]>('/config/slabs/');
    return Array.isArray(res) ? res : res.results || [];
  },

  async createDistanceSlab(data: Partial<DistanceSlab>): Promise<DistanceSlab> {
    return apiClient<DistanceSlab>('/config/slabs/', {
      method: 'POST',
      body: data,
    });
  },

  async updateDistanceSlab(id: number | string, data: Partial<DistanceSlab>): Promise<DistanceSlab> {
    return apiClient<DistanceSlab>(`/config/slabs/${id}/`, {
      method: 'PATCH',
      body: data,
    });
  },

  async deleteDistanceSlab(id: number | string): Promise<void> {
    return apiClient<void>(`/config/slabs/${id}/`, {
      method: 'DELETE',
    });
  },

  // Shipping Rules
  async getShippingRules(): Promise<any[]> {
    const res = await apiClient<any>('/config/shipping-rules/');
    return Array.isArray(res) ? res : res.results || [];
  },

  async createShippingRule(data: { state: string; cost: number; is_active?: boolean }): Promise<any> {
    return apiClient<any>('/config/shipping-rules/', {
      method: 'POST',
      body: data,
    });
  },

  async deleteShippingRule(id: string | number): Promise<void> {
    return apiClient<void>(`/config/shipping-rules/${id}/`, {
      method: 'DELETE',
    });
  },

  // Coupon Pre-validation
  async validateCoupon(code: string, orderAmount: string | number): Promise<CouponValidationResult> {
    return apiClient<CouponValidationResult>('/config/coupons/validate/', {
      method: 'POST',
      body: {
        code: code.trim(),
        order_amount: String(orderAmount),
      },
      skipAuth: true,
    });
  },
};
