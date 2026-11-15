import { apiClient } from './client';
import {
  StoreProfile,
  DeliveryConfiguration,
  DistanceSlab,
  TaxConfiguration,
  AdminConfigAuditLog,
  CouponValidationResult,
  PaginatedResponse,
} from '../types/api';

const CONFIG_CACHE_TTL_MS = 60 * 1000;

let deliveryConfigCache: { data: DeliveryConfiguration[]; timestamp: number } | null = null;
let deliveryConfigPending: Promise<DeliveryConfiguration[]> | null = null;

let shippingRulesCache: { data: any[]; timestamp: number } | null = null;
let shippingRulesPending: Promise<any[]> | null = null;

export const clearConfigCache = () => {
  deliveryConfigCache = null;
  shippingRulesCache = null;
};

export const configApi = {
  // Store Profile
  async getStoreProfile(): Promise<StoreProfile> {
    return apiClient<StoreProfile>('/config/store/');
  },

  async updateStoreProfile(data: Partial<StoreProfile>): Promise<StoreProfile> {
    clearConfigCache();
    return apiClient<StoreProfile>('/config/store/', {
      method: 'PATCH',
      body: data,
    });
  },

  // Delivery Configuration
  async getDeliveryConfig(options?: { forceRefresh?: boolean }): Promise<DeliveryConfiguration[]> {
    const now = Date.now();
    if (!options?.forceRefresh && deliveryConfigCache && now - deliveryConfigCache.timestamp < CONFIG_CACHE_TTL_MS) {
      return deliveryConfigCache.data;
    }
    if (deliveryConfigPending) {
      return deliveryConfigPending;
    }
    deliveryConfigPending = (async () => {
      try {
        const res = await apiClient<PaginatedResponse<DeliveryConfiguration> | DeliveryConfiguration[]>('/config/delivery/');
        const data = Array.isArray(res) ? res : res.results || [];
        deliveryConfigCache = { data, timestamp: Date.now() };
        return data;
      } finally {
        deliveryConfigPending = null;
      }
    })();
    return deliveryConfigPending;
  },

  async updateDeliveryConfig(id: number | string, data: Partial<DeliveryConfiguration>): Promise<DeliveryConfiguration> {
    clearConfigCache();
    return apiClient<DeliveryConfiguration>(`/config/delivery/${id}/`, {
      method: 'PATCH',
      body: data,
    });
  },

  async createDeliveryConfig(data: Partial<DeliveryConfiguration>): Promise<DeliveryConfiguration> {
    clearConfigCache();
    return apiClient<DeliveryConfiguration>('/config/delivery/', {
      method: 'POST',
      body: data,
    });
  },

  // Distance Slabs
  async getDistanceSlabs(): Promise<DistanceSlab[]> {
    const res = await apiClient<PaginatedResponse<DistanceSlab> | DistanceSlab[]>('/config/slabs/');
    return Array.isArray(res) ? res : res.results || [];
  },

  async createDistanceSlab(data: Partial<DistanceSlab>): Promise<DistanceSlab> {
    clearConfigCache();
    return apiClient<DistanceSlab>('/config/slabs/', {
      method: 'POST',
      body: data,
    });
  },

  async updateDistanceSlab(id: number | string, data: Partial<DistanceSlab>): Promise<DistanceSlab> {
    clearConfigCache();
    return apiClient<DistanceSlab>(`/config/slabs/${id}/`, {
      method: 'PATCH',
      body: data,
    });
  },

  async deleteDistanceSlab(id: number | string): Promise<void> {
    clearConfigCache();
    return apiClient<void>(`/config/slabs/${id}/`, {
      method: 'DELETE',
    });
  },

  // Shipping Rules
  async getShippingRules(options?: { forceRefresh?: boolean }): Promise<any[]> {
    const now = Date.now();
    if (!options?.forceRefresh && shippingRulesCache && now - shippingRulesCache.timestamp < CONFIG_CACHE_TTL_MS) {
      return shippingRulesCache.data;
    }
    if (shippingRulesPending) {
      return shippingRulesPending;
    }
    shippingRulesPending = (async () => {
      try {
        const res = await apiClient<any>('/config/shipping-rules/');
        const data = Array.isArray(res) ? res : res.results || [];
        shippingRulesCache = { data, timestamp: Date.now() };
        return data;
      } finally {
        shippingRulesPending = null;
      }
    })();
    return shippingRulesPending;
  },

  async createShippingRule(data: { state: string; cost: number; is_active?: boolean }): Promise<any> {
    clearConfigCache();
    return apiClient<any>('/config/shipping-rules/', {
      method: 'POST',
      body: data,
    });
  },

  async deleteShippingRule(id: string | number): Promise<void> {
    clearConfigCache();
    return apiClient<void>(`/config/shipping-rules/${id}/`, {
      method: 'DELETE',
    });
  },

  // Tax Configuration
  async getTaxConfig(): Promise<TaxConfiguration[]> {
    const res = await apiClient<PaginatedResponse<TaxConfiguration> | TaxConfiguration[]>('/config/tax/');
    return Array.isArray(res) ? res : res.results || [];
  },

  async updateTaxConfig(id: number | string, data: Partial<TaxConfiguration>): Promise<TaxConfiguration> {
    return apiClient<TaxConfiguration>(`/config/tax/${id}/`, {
      method: 'PATCH',
      body: data,
    });
  },

  // Audit Logs
  async getAuditLogs(): Promise<AdminConfigAuditLog[]> {
    const res = await apiClient<PaginatedResponse<AdminConfigAuditLog> | AdminConfigAuditLog[]>('/config/audit-logs/');
    return Array.isArray(res) ? res : res.results || [];
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
