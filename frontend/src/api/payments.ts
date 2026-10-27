import { apiClient } from './client';
import {
  PaymentIntentResponse,
  PaymentVerifyPayload,
  PaymentVerifyResponse,
  PaymentTransaction,
} from '../types/api';

export const paymentsApi = {
  /**
   * Retrieves server-controlled payment destination and gateway public configuration.
   */
  async getPaymentConfig(): Promise<{
    key_id: string;
    payment_handle: string;
    is_live: boolean;
    gateway_enabled: boolean;
    currency: string;
  }> {
    return apiClient('/payments/config/');
  },

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

  /**
   * Razorpay Standard Web Checkout - Create Order
   * Endpoint: POST /api/create-order or /payments/create-order/
   * Request: { amount (paise), currency, receipt }
   * Return: { order_id, amount, currency, key_id }
   */
  async createOrder(params: {
    amount: number;
    currency?: string;
    receipt?: string;
    order_id?: number;
    notes?: Record<string, any>;
  }): Promise<{
    order_id: string;
    amount: number;
    currency: string;
    key_id: string;
    receipt?: string;
  }> {
    return apiClient('/payments/create-order/', {
      method: 'POST',
      body: params,
    });
  },

  /**
   * Razorpay Standard Web Checkout - Verify Payment Signature
   * Endpoint: POST /api/verify-payment or /payments/verify-payment/
   * Request: { razorpay_order_id, razorpay_payment_id, razorpay_signature }
   * Algorithm: HMAC-SHA256(order_id + "|" + payment_id, KEY_SECRET)
   */
  async verifyPaymentSignature(payload: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }): Promise<{
    status: string;
    message: string;
    razorpay_order_id: string;
    razorpay_payment_id: string;
  }> {
    return apiClient('/payments/verify-payment/', {
      method: 'POST',
      body: payload,
    });
  },
};
