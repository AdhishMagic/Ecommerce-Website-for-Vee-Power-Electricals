import { OrderStatus, PaymentStatus } from './api';

export interface OrderItem {
  id?: number | string;
  productId: string;
  name: string;
  price: number;
  quantity: number;
  image?: string;
  sku?: string;
  total?: number;
}

export interface Order {
  id: string | number;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  shippingAddress: {
    address: string;
    city: string;
    state: string;
    pincode: string;
    recipient_name?: string;
    phone?: string;
    line1?: string;
    line2?: string;
  };
  billingAddress?: any;
  items: OrderItem[];
  subtotal?: number;
  totalAmount: number;
  taxAmount: number;
  shippingFee: number;
  status: OrderStatus | string;
  paymentStatus: PaymentStatus | string;
  paymentMethod: string;
  trackingNumber?: string | null;
  createdAt: string;
}
