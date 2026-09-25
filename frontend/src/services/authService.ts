import { authApi } from '../api/auth';
import { UserProfile } from '../types/api';
import { User } from '../types/user';

export const mapProfileToUser = (profile: UserProfile): User => {
  const name =
    [profile.first_name, profile.last_name].filter(Boolean).join(' ') ||
    profile.username ||
    profile.email.split('@')[0];
  const isAdmin =
    profile.role?.toLowerCase() === 'admin' ||
    profile.is_staff === true ||
    profile.is_superuser === true;

  return {
    id: profile.id,
    name,
    email: profile.email,
    phone: profile.phone,
    role: isAdmin ? 'admin' : 'customer',
    is_admin: isAdmin,
  };
};

export const authService = {
  async getCurrentUser(): Promise<User | null> {
    try {
      const profile = await authApi.getMe();
      return mapProfileToUser(profile);
    } catch {
      return null;
    }
  },

  async login(email: string, password?: string): Promise<{ user: User; token: string }> {
    if (!password) {
      throw new Error('Password is required.');
    }
    const res = await authApi.login({ email, password });
    const user = mapProfileToUser(res.user);
    return {
      user,
      token: res.access,
    };
  },

  async register(data: {
    email: string;
    password: string;
    first_name: string;
    last_name: string;
    phone?: string;
  }): Promise<{ user: User; token: string }> {
    const res = await authApi.register(data);
    const user = mapProfileToUser(res.user);
    return {
      user,
      token: res.access,
    };
  },

  async logout(): Promise<void> {
    await authApi.logout();
  },

  async updateProfile(data: {
    first_name?: string;
    last_name?: string;
    phone?: string;
  }): Promise<User> {
    const profile = await authApi.updateProfile(data);
    return mapProfileToUser(profile);
  },
};
