export interface User {
  id: string | number;
  name: string;
  email: string;
  phone?: string | null;
  role: 'customer' | 'admin' | 'CUSTOMER' | 'ADMIN';
  is_admin?: boolean;
  address?: {
    street: string;
    city: string;
    state: string;
    pincode: string;
  };
}
