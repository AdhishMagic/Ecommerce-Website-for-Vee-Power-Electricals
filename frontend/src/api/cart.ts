import { apiClient } from './client';
import { ApiCart } from '../types/api';

export const cartApi = {
  async getCart(guestSessionId?: string, signal?: AbortSignal): Promise<ApiCart> {
    const headers: Record<string, string> = {};
    if (guestSessionId) {
      headers['X-Guest-Session-Id'] = guestSessionId;
    }
    return apiClient<ApiCart>('/cart/', { headers, signal });
  },

  async addToCart(
    productId: number | string,
    quantity: number = 1,
    guestSessionId?: string
  ): Promise<ApiCart> {
    const headers: Record<string, string> = {};
    if (guestSessionId) {
      headers['X-Guest-Session-Id'] = guestSessionId;
    }
    return apiClient<ApiCart>('/cart/items/', {
      method: 'POST',
      headers,
      body: {
        product_id: Number(productId),
        quantity,
      },
    });
  },

  async updateItemQuantity(
    productId: number | string,
    quantity: number,
    guestSessionId?: string
  ): Promise<ApiCart> {
    const headers: Record<string, string> = {};
    if (guestSessionId) {
      headers['X-Guest-Session-Id'] = guestSessionId;
    }
    return apiClient<ApiCart>(`/cart/items/product/${productId}/`, {
      method: 'PATCH',
      headers,
      body: { quantity },
    });
  },

  async removeItem(
    productId: number | string,
    guestSessionId?: string
  ): Promise<ApiCart> {
    const headers: Record<string, string> = {};
    if (guestSessionId) {
      headers['X-Guest-Session-Id'] = guestSessionId;
    }
    return apiClient<ApiCart>(`/cart/items/product/${productId}/`, {
      method: 'DELETE',
      headers,
    });
  },

  async clearCart(guestSessionId?: string): Promise<ApiCart> {
    const headers: Record<string, string> = {};
    if (guestSessionId) {
      headers['X-Guest-Session-Id'] = guestSessionId;
    }
    const res = await apiClient<{ detail: string; cart: ApiCart }>('/cart/clear/', {
      method: 'POST',
      headers,
    });
    return res.cart;
  },

  async mergeGuestCart(guestSessionId: string): Promise<ApiCart> {
    return apiClient<ApiCart>('/cart/merge/', {
      method: 'POST',
      body: { guest_session_id: guestSessionId },
    });
  },
};
