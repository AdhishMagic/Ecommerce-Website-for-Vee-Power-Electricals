export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: 'customer' | 'admin';
  address?: {
    street: string;
    city: string;
    state: string;
    pincode: string;
  };
}
