import { User } from '../types/user';
import { apiFetch } from './api';

export const authService = {
  async getCurrentUser(): Promise<User | null> {
    try {
      return await apiFetch<User>('/auth/me/');
    } catch {
      return null;
    }
  },

  async login(email: string): Promise<{ user: User; token: string }> {
    try {
      return await apiFetch<{ user: User; token: string }>('/auth/login/', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
    } catch {
      return {
        user: { id: 'u001', name: 'Demo User', email, phone: '9876543210', role: 'customer' },
        token: 'demo-token',
      };
    }
  }
};
