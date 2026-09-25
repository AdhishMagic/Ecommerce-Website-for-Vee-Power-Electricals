import { apiClient } from './client';
import {
  PaymentIntentResponse,
  PaymentVerifyPayload,
  PaymentVerifyResponse,
  PaymentTransaction,
} from '../types/api';

export const paymentsApi = {
  /**
   * Initiate Razorpay payment intent for an order.
   * Returns server-derived gateway order details and authoritative amount.
   */
  async initiatePayment(orderId: number, paymentMethod: string = 'UPI'): Promise<PaymentIntentResponse> {
    return apiClient<PaymentIntentResponse>('/payments/initiate/', {
      method: 'POST',
      body: {
        order_id: orderId,
        payment_method: paymentMethod,
      },
    });
  },

  /**
   * Verifies Razorpay HMAC-SHA256 signature server-side and confirms payment.
   */
  async verifyPayment(payload: PaymentVerifyPayload): Promise<PaymentVerifyResponse> {
    return apiClient<PaymentVerifyResponse>('/payments/verify/', {
      method: 'POST',
      body: payload,
    });
  },

  /**
   * Retrieves latest payment transaction status for an order.
   */
  async getOrderPaymentStatus(orderId: number): Promise<PaymentTransaction> {
    return apiClient<PaymentTransaction>(`/payments/order/${orderId}/`);
  },
};
