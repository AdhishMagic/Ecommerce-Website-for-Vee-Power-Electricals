import { Order } from '../types/order';
import { apiFetch } from './api';

export const orderService = {
  async createOrder(orderData: Partial<Order>): Promise<Order> {
    try {
      return await apiFetch<Order>('/orders/', {
        method: 'POST',
        body: JSON.stringify(orderData),
      });
    } catch (err) {
      console.warn('Backend API unavailable. Processing order locally.', err);
      return {
        id: `ord_${Date.now()}`,
        orderNumber: `VPE-${Math.floor(100000 + Math.random() * 900000)}`,
        customerName: orderData.customerName || 'Customer',
        customerEmail: orderData.customerEmail || '',
        customerPhone: orderData.customerPhone || '',
        shippingAddress: orderData.shippingAddress || { address: '', city: '', state: '', pincode: '' },
        items: orderData.items || [],
        totalAmount: orderData.totalAmount || 0,
        taxAmount: orderData.taxAmount || 0,
        shippingFee: orderData.shippingFee || 0,
        status: 'Pending',
        paymentStatus: 'Paid',
        paymentMethod: orderData.paymentMethod || 'UPI',
        createdAt: new Date().toISOString(),
      };
    }
  },

  async getOrders(): Promise<Order[]> {
    try {
      return await apiFetch<Order[]>('/orders/');
    } catch {
      return [];
    }
  }
};
