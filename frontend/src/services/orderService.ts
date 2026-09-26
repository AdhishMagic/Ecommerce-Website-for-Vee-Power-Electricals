import { Order, OrderItem } from '../types/order';
import { ordersApi } from '../api/orders';
import { OrderSummary, OrderDetailData, CheckoutPayload, OrderStatus } from '../types/api';

const mapApiSummaryToOrder = (o: OrderSummary): Order => {
  return {
    id: o.id,
    orderNumber: o.order_number,
    customerName: o.customer_name,
    customerEmail: o.customer_email,
    customerPhone: o.customer_phone,
    shippingAddress: {
      address: '',
      city: '',
      state: '',
      pincode: '',
    },
    items: [],
    subtotal: Number(o.subtotal) || 0,
    totalAmount: Number(o.total_amount) || 0,
    taxAmount: Number(o.tax_amount) || 0,
    shippingFee: Number(o.shipping_fee) || 0,
    status: o.status,
    paymentStatus: o.payment_status,
    paymentMethod: o.payment_method || 'UPI',
    createdAt: o.created_at,
  };
};

const mapApiDetailToOrder = (d: OrderDetailData): Order => {
  const shipping = d.shipping_address || {};
  const items: OrderItem[] = Array.isArray(d.items)
    ? d.items.map((i) => ({
        id: i.id,
        productId: String(i.product),
        name: i.product_name,
        price: Number(i.unit_price) || 0,
        quantity: i.quantity,
        image: i.image_url || '',
        sku: i.sku,
        total: Number(i.total_amount) || 0,
      }))
    : [];

  return {
    id: d.id,
    orderNumber: d.order_number,
    customerName: d.customer_name,
    customerEmail: d.customer_email,
    customerPhone: d.customer_phone,
    shippingAddress: {
      address: [shipping.address_line1, shipping.address_line2, shipping.landmark].filter(Boolean).join(', ') || shipping.address || '',
      city: shipping.city || '',
      state: shipping.state || '',
      pincode: shipping.pincode || '',
      recipient_name: shipping.recipient_name,
      phone: shipping.phone,
      line1: shipping.address_line1,
      line2: shipping.address_line2,
    },
    billingAddress: d.billing_address,
    items,
    subtotal: Number(d.subtotal) || 0,
    totalAmount: Number(d.total_amount) || 0,
    taxAmount: Number(d.cgst_amount || 0) + Number(d.sgst_amount || 0) + Number(d.igst_amount || 0),
    shippingFee: Number(d.shipping_fee) || 0,
    status: d.status,
    paymentStatus: d.payment_status,
    paymentMethod: d.payment_method || 'UPI',
    trackingNumber: d.tracking_number,
    createdAt: d.created_at,
  };
};

export const orderService = {
  async checkout(payload: CheckoutPayload): Promise<Order> {
    const detail = await ordersApi.checkout(payload);
    return mapApiDetailToOrder(detail);
  },

  async getMyOrders(params?: { page?: number; page_size?: number }): Promise<Order[]> {
    const res = await ordersApi.getMyOrders(params);
    const results = Array.isArray(res) ? res : res.results || [];
    return results.map(mapApiSummaryToOrder);
  },

  async getAdminOrders(params?: {
    status?: OrderStatus;
    search?: string;
    page?: number;
    page_size?: number;
  }): Promise<Order[]> {
    const res = await ordersApi.getAdminOrders(params);
    const results = Array.isArray(res) ? res : res.results || [];
    return results.map(mapApiSummaryToOrder);
  },

  async getOrderDetail(id: number | string): Promise<Order> {
    const detail = await ordersApi.getOrderDetail(id);
    return mapApiDetailToOrder(detail);
  },

  async updateOrderStatus(id: number | string, status: OrderStatus, reason: string = ''): Promise<Order> {
    const detail = await ordersApi.updateOrderStatus(id, status, reason);
    return mapApiDetailToOrder(detail);
  },

  async cancelOrder(id: number | string, reason: string = ''): Promise<Order> {
    const detail = await ordersApi.cancelOrder(id, reason);
    return mapApiDetailToOrder(detail);
  },

  async requestReturn(id: number | string, reason: string): Promise<Order> {
    const detail = await ordersApi.requestReturn(id, reason);
    return mapApiDetailToOrder(detail);
  },
};

