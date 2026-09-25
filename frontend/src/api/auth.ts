import { apiClient, clearAuthStorage, setAuthTokens, getRefreshToken } from './client';
import { AuthResponse, UserProfile } from '../types/api';

export const authApi = {
  async register(data: {
    email: string;
    password: string;
    first_name: string;
    last_name: string;
    phone?: string;
  }): Promise<AuthResponse> {
    const res = await apiClient<AuthResponse>('/auth/register/', {
      method: 'POST',
      body: data,
      skipAuth: true,
    });
    if (res.access) {
      setAuthTokens(res.access, res.refresh);
    }
    return res;
  },

  async login(data: { email: string; password: string }): Promise<AuthResponse> {
    const res = await apiClient<AuthResponse>('/auth/login/', {
      method: 'POST',
      body: data,
      skipAuth: true,
    });
    if (res.access) {
      setAuthTokens(res.access, res.refresh);
    }
    return res;
  },

  async logout(): Promise<{ message: string }> {
    const refreshToken = getRefreshToken();
    try {
      if (refreshToken) {
        await apiClient<{ message: string }>('/auth/logout/', {
          method: 'POST',
          body: { refresh: refreshToken },
        });
      }
    } catch {
      // Continue cleanup even if server invalidation errors
    } finally {
      clearAuthStorage();
    }
    return { message: 'Logged out successfully.' };
  },

  async getMe(): Promise<UserProfile> {
    return apiClient<UserProfile>('/auth/me/');
  },

  async updateProfile(data: {
    first_name?: string;
    last_name?: string;
    phone?: string;
  }): Promise<UserProfile> {
    return apiClient<UserProfile>('/auth/me/', {
      method: 'PATCH',
      body: data,
    });
  },

  async requestPasswordReset(email: string): Promise<{ message: string }> {
    return apiClient<{ message: string }>('/auth/password-reset/', {
      method: 'POST',
      body: { email },
      skipAuth: true,
    });
  },

  async confirmPasswordReset(data: {
    uidb64: string;
    token: string;
    new_password: string;
  }): Promise<{ message: string }> {
    return apiClient<{ message: string }>('/auth/password-reset/confirm/', {
      method: 'POST',
      body: data,
      skipAuth: true,
    });
  },
};
