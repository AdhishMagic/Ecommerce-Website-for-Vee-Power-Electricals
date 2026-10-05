// Canonical Order Status matching Phase 2/Phase 6 backend contract
export type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PACKED'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'RETURN_REQUESTED'
  | 'RETURN_APPROVED'
  | 'RETURN_REJECTED'
  | 'RETURN_COMPLETED';

export type PaymentStatus = 'Pending' | 'Paid' | 'Failed' | 'Refunded';

export type UserRole = 'customer' | 'admin';

export interface UserProfile {
  id: number | string;
  email: string;
  username: string;
  first_name: string;
  last_name: string;
  phone?: string | null;
  role: UserRole;
  is_active: boolean;
  is_staff: boolean;
  is_superuser: boolean;
  created_at?: string;
  updated_at?: string;
}
export interface AuthTokens {
  access: string;
  refresh: string;
}

export interface AuthResponse {
  message: string;
  user: UserProfile;
  access: string;
  refresh: string;
  tokens?: AuthTokens;
}

export interface GoogleAuthResponse extends AuthResponse {
  provider?: 'google';
  is_new_user?: boolean;
  linked_existing_account?: boolean;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  image?: string;
  subtitle?: string;
  is_active: boolean;
  show_in_hero: boolean;
  hero_order: number;
  hero_badge?: string;
  discount_enabled: boolean;
  discount_type: 'percentage' | 'fixed';
  discount_value: number | string;
  discount_label?: string;
  product_count?: number;
  subcategories?: Subcategory[];
}

export interface Subcategory {
  id: number;
  name: string;
  slug: string;
  category: number;
  category_name?: string;
  image?: string;
  is_active: boolean;
}

export interface Brand {
  id: number;
  name: string;
  slug: string;
  logo?: string;
  description?: string;
  is_active: boolean;
}

export interface ProductImage {
  id: number;
  image: string;
  is_primary: boolean;
  display_order: number;
}

export interface ProductSpecification {
  id: number;
  key: string;
  value: string;
  display_order: number;
}

export interface ProductSummary {
  id: number;
  name: string;
  slug: string;
  sku: string;
  category: number | { id: number; name: string; slug: string };
  category_name?: string;
  subcategory?: number | { id: number; name: string; slug: string } | null;
  subcategory_name?: string;
  brand: number | { id: number; name: string; slug: string };
  brand_name?: string;
  mrp: string | number;
  price: string | number;
  in_stock: boolean;
  stock?: number;
  low_stock_threshold?: number;
  primary_image?: string;
  featured: boolean;
  active: boolean;
  created_at: string;
}

export interface ProductDetail extends ProductSummary {
  description: string;
  warranty_period?: string;
  images: ProductImage[];
  specifications: ProductSpecification[];
}

export interface CustomerAddress {
  id: number;
  recipient_name: string;
  phone: string;
  address_line1: string;
  address_line2?: string;
  landmark?: string;
  city: string;
  state: string;
  pincode: string;
  address_type: 'home' | 'work' | 'other';
  is_default: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface OrderItem {
  id: number;
  product: number;
  product_name: string;
  sku: string;
  image_url?: string;
  mrp: string | number;
  unit_price: string | number;
  quantity: number;
  line_discount: string | number;
  taxable_amount: string | number;
  tax_rate: string | number;
  tax_amount: string | number;
  subtotal: string | number;
  total_amount: string | number;
  created_at?: string;
}

export interface OrderStatusHistoryItem {
  id: number;
  previous_status: OrderStatus | null;
  new_status: OrderStatus;
  changed_by_email?: string;
  reason?: string;
  created_at: string;
}

export interface OrderSummary {
  id: number;
  order_number: string;
  user: number;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  subtotal: string | number;
  tax_amount: string | number;
  shipping_fee: string | number;
  total_amount: string | number;
  status: OrderStatus;
  payment_status: PaymentStatus;
  payment_method: string;
  items_count: number;
  created_at: string;
}

export interface OrderDetailData {
  id: number;
  order_number: string;
  user: number;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  shipping_address: Record<string, any>;
  billing_address?: Record<string, any> | null;
  is_business_order: boolean;
  company_name?: string | null;
  gstin?: string | null;
  subtotal: string | number;
  product_discount: string | number;
  order_discount: string | number;
  total_discount: string | number;
  taxable_amount: string | number;
  cgst_amount: string | number;
  sgst_amount: string | number;
  igst_amount: string | number;
  shipping_fee: string | number;
  shipping_discount: string | number;
  total_amount: string | number;
  status: OrderStatus;
  payment_status: PaymentStatus;
  payment_method: string;
  tracking_number?: string | null;
  notes?: string;
  items: OrderItem[];
  status_history: OrderStatusHistoryItem[];
  created_at: string;
  updated_at: string;
}

export interface CheckoutInputItem {
  product_id: number;
  quantity: number;
}

export interface CheckoutPayload {
  shipping_address_id: number;
  billing_address_id?: number | null;
  items: CheckoutInputItem[];
  payment_method?: string;
  coupon_code?: string;
  notes?: string;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  page?: number;
  total_pages?: number;
  results: T[];
}

export interface StoreProfile {
  legal_name: string;
  trading_name?: string;
  gstin: string;
  email: string;
  phone: string;
  address_line1: string;
  address_line2?: string;
  city: string;
  state: string;
  pincode: string;
  currency: string;
}

export interface DistanceSlab {
  id: number;
  min_distance_km: number | string;
  max_distance_km: number | string;
  rate: number | string;
  is_active: boolean;
}

export interface DeliveryConfiguration {
  id: number;
  origin_pincode: string;
  base_delivery_charge: number | string;
  distance_slab_km: number | string;
  charge_per_slab: number | string;
  free_delivery_threshold: number | string;
  is_active: boolean;
  slabs?: DistanceSlab[];
}

export interface CouponValidationResult {
  valid: boolean;
  code: string;
  discount_type?: 'PERCENTAGE' | 'FLAT';
  discount_value?: string;
  calculated_discount?: string;
  description?: string;
  detail?: string;
}

export interface TaxConfiguration {
  id: number;
  tax_name: string;
  default_tax_rate: number | string;
  cgst_rate: number | string;
  sgst_rate: number | string;
  igst_rate: number | string;
  tax_calculation_mode: 'TAX_EXCLUSIVE' | 'TAX_INCLUSIVE';
  business_state: string;
  effective_from: string;
  effective_until?: string | null;
  version_number: number;
  is_active: boolean;
}

export interface AdminConfigAuditLog {
  id: number;
  admin_user?: number | null;
  admin_email?: string;
  domain: string;
  record_id: number;
  action_type: 'CREATE' | 'UPDATE' | 'DEACTIVATE' | 'DELETE';
  old_value?: Record<string, any> | null;
  new_value: Record<string, any>;
  change_reason: string;
  ip_address?: string | null;
  created_at: string;
}

export interface InquiryPayload {
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
}

export interface InquiryItem {
  id: number;
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  status: 'New' | 'In Progress' | 'Resolved' | 'Closed';
  admin_notes?: string;
  created_at: string;
}

export interface ClientItem {
  id: number;
  client_code: string;
  company_name: string;
  contact_person: string;
  gstin: string;
  pan?: string;
  state?: string;
  state_code?: string;
  customer_type?: string;
  email: string;
  phone: string;
  credit_limit: number | string;
  credit_exposure?: number | string;
  available_credit?: number | string;
  outstanding_balance?: number | string;
  address?: string;
  billing_address?: string;
  shipping_address?: string;
  is_active: boolean;
  total_invoiced?: number | string;
  created_at?: string;
  updated_at?: string;
}

export interface QuotationItem {
  id?: number;
  product?: number;
  product_name?: string;
  description?: string;
  quantity: number;
  unit_price: number | string;
  total_price?: number | string;
}

export interface Quotation {
  id: number;
  quotation_number: string;
  client: number;
  client_name?: string;
  quotation_date: string;
  expiry_date: string;
  total_value: number | string;
  status: 'Draft' | 'Sent' | 'Approved' | 'Rejected' | 'Converted';
  notes?: string;
  items?: QuotationItem[];
  created_at?: string;
}

export interface InvoiceItem {
  id?: number;
  product?: number;
  product_name?: string;
  quantity: number;
  unit_price: number | string;
  tax_rate?: number | string;
  tax_amount?: number | string;
  total_price?: number | string;
}

export interface Invoice {
  id: number;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  order?: number | null;
  order_number?: string;
  quotation?: number | null;
  quotation_number?: string;
  client?: number | null;
  client_name?: string;
  subtotal: number | string;
  tax_amount: number | string;
  shipping_fee: number | string;
  total_amount: number | string;
  paid_amount?: number | string;
  outstanding_amount?: number | string;
  status: 'Paid' | 'Unpaid' | 'Overdue' | 'Cancelled';
  payment_status: string;
  notes?: string;
  items?: InvoiceItem[];
  created_at?: string;
}

export interface InventoryItem {
  id: number;
  name: string;
  sku: string;
  category: number | string;
  category_name?: string;
  brand: number | string;
  brand_name?: string;
  stock: number;
  low_stock_threshold: number;
  is_low_stock: boolean;
  price: number | string;
  mrp: number | string;
  active: boolean;
}

export interface StockLedgerTransaction {
  id: number;
  product: number;
  product_name: string;
  product_sku: string;
  change_amount: number;
  transaction_type: 'RESTOCK' | 'SALE' | 'ADJUSTMENT' | 'RETURN' | 'DAMAGE';
  order?: number | null;
  performed_by_email?: string;
  notes?: string;
  created_at: string;
}

export interface PaymentTransaction {
  id: number;
  order?: number | null;
  order_number?: string;
  invoice?: number | null;
  invoice_number?: string;
  customer_name?: string;
  customer_email?: string;
  gateway: string;
  gateway_transaction_id?: string;
  amount: number | string;
  currency: string;
  status: string;
  payment_method: string;
  created_at: string;
}

export interface PayoutSettlement {
  id: number;
  settlement_id: string;
  gateway: string;
  settlement_date: string;
  gross_amount: number | string;
  gateway_fee: number | string;
  tax_on_fee: number | string;
  net_amount: number | string;
  status: string;
  bank_reference?: string;
  utr?: string;
  notes?: string;
}

export interface ExpenseItem {
  id: number;
  expense_date: string;
  date?: string;
  category: 'Logistics' | 'Marketing' | 'Software' | 'Inventory' | 'Utilities' | 'Operations' | string;
  description: string;
  vendor: string;
  amount: number | string;
  status: 'Paid' | 'Pending';
  payment_mode?: string | null;
  receipt_url?: string | null;
  created_by?: number | null;
  created_by_email?: string;
  created_at?: string;
  updated_at?: string;
}

export interface PaymentIntentResponse {
  key_id: string;
  order_id: number;
  order_number: string;
  gateway_order_id: string;
  amount: number;
  amount_inr: string;
  currency: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  transaction_id: number;
}

export interface PaymentVerifyPayload {
  order_id: number;
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
  payment_method?: string;
}

export interface PaymentVerifyResponse {
  status: 'SUCCESS' | string;
  message: string;
  order_id: number;
  transaction_id: number;
  payment_status: PaymentStatus;
  order_status: OrderStatus;
}

export interface FinanceSummary {
  kpis: {
    total_invoiced: number;
    total_paid: number;
    total_outstanding: number;
    b2b_outstanding: number;
    total_expenses: number;
    net_profit: number;
    overdue_invoices_count: number;
  };
  monthly_trend: Array<{
    month: string;
    revenue: number;
    expenses: number;
    net: number;
  }>;
  recent_transactions?: Array<{
    id: number;
    date: string;
    type: 'INVOICE' | 'EXPENSE';
    description: string;
    amount: number;
    status: string;
  }>;
}

/**
 * Authoritative Admin dashboard contract returned by `GET /api/v1/finance/summary/`.
 *
 * Date-filtered metrics (`total_sales`, `total_invoiced`, `total_expenses`) follow the
 * requested `filter_type`. Balance and operational metrics (`total_outstanding`,
 * `b2b_outstanding`, order/return counts) are complete-database snapshots and never
 * depend on pagination or page size.
 */
export interface DashboardSummary {
  date_range: {
    filter_type: string;
    /** ISO date, or null for the unbounded `all_time` window. */
    start_date: string | null;
    end_date: string | null;
  };
  kpis: {
    total_invoiced: string;
    total_paid: string;
    total_outstanding: string;
    b2b_outstanding: string;
    total_expenses: string;
    paid_expenses: string;
    net_profit: string;
    operating_margin: string;
  };
  total_sales: string;
  total_invoiced: string;
  total_outstanding: string;
  b2b_outstanding: string;
  total_expenses: string;
  open_orders_count: number;
  confirmed_orders_count: number;
  out_for_delivery_count: number;
  returns_count: number;
  total_orders_count: number;
  order_metrics: {
    scope: 'snapshot';
    total_orders_count: number;
    open_orders_count: number;
    confirmed_orders_count: number;
    out_for_delivery_count: number;
    returns_count: number;
    pending_orders_count: number;
    packed_orders_count: number;
    shipped_orders_count: number;
    delivered_orders_count: number;
    cancelled_orders_count: number;
    returns_by_status: Record<string, number>;
  };
  payouts_summary: {
    gross_amount: string;
    fees: string;
    net_amount: string;
  };
  monthly_trend: Array<{
    month: string;
    month_label: string;
    revenue: number;
    expenses: number;
    net: number;
  }>;
}

export interface CustomerAddressItem {
  id: number;
  recipient_name: string;
  phone: string;
  address_line1: string;
  address_line2?: string;
  landmark?: string;
  city: string;
  state: string;
  pincode: string;
  address_type: 'home' | 'work' | 'other';
  is_default: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface CustomerRecentOrder {
  id: number;
  order_number: string;
  created_at: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  payment_method: string;
  total_amount: string;
  items_count: number;
}

export interface CustomerOrderSummary {
  total_orders: number;
  pending_orders: number;
  completed_orders: number;
  cancelled_orders: number;
  returned_orders: number;
  total_spent: string;
}

export interface CustomerFinancialSummary {
  total_invoiced: string;
  paid_amount: string;
  outstanding_amount: string;
  invoice_count: number;
}

export interface Customer {
  id: number;
  customer_id: string;
  name: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  customer_type: 'B2B' | 'B2C';
  orders_count: number;
  total_spent: string;
  outstanding_balance: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CustomerDetail extends Customer {
  role: UserRole;
  last_login: string | null;
  addresses: CustomerAddressItem[];
  order_summary: CustomerOrderSummary;
  financial_summary: CustomerFinancialSummary;
  recent_orders: CustomerRecentOrder[];
}

export interface CustomerSummary {
  total_customers: number;
  active_customers: number;
  inactive_customers: number;
  new_customers_30d: number;
  b2b_customers: number;
  total_spent: string;
  total_outstanding: string;
}

export interface CustomerFilters {
  search?: string;
  status?: 'all' | 'active' | 'inactive';
  customer_type?: 'all' | 'b2b' | 'b2c';
  ordering?: string;
  page?: number;
  page_size?: number;
  from_date?: string;
  to_date?: string;
}

export interface CustomerCreateInput {
  first_name: string;
  last_name?: string;
  email: string;
  phone?: string;
  password?: string;
  is_active?: boolean;
  address_line1?: string;
  address_line2?: string;
  landmark?: string;
  city?: string;
  state?: string;
  pincode?: string;
  address_type?: 'home' | 'work' | 'other';
}

export interface CustomerUpdateInput {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  is_active?: boolean;
}


