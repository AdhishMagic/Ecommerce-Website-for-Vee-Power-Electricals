export interface User {
  id: string | number;
  name: string;
  email: string;
  phone?: string | null;
  role: 'customer' | 'admin' | 'CUSTOMER' | 'ADMIN';
  is_admin?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
  address?: {
    street: string;
    city: string;
    state: string;
    pincode: string;
  };
}
