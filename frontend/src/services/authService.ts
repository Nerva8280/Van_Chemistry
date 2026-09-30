import api, { API_ORIGIN } from './api';
import { User } from '../types';

export const authService = {
  async me(): Promise<User | null> {
    const res = await api.get<{ user: User | null }>('/auth/me');
    return res.data.user;
  },

  async logout(): Promise<void> {
    await api.post('/auth/logout');
  },

  /** Chỉ có trên môi trường test. */
  async testLogin(password: string): Promise<void> {
    await api.post('/auth/test-login', { password });
  },

  googleLoginUrl(): string {
    return `${API_ORIGIN}/api/auth/google`;
  },

  microsoftLoginUrl(): string {
    return `${API_ORIGIN}/api/auth/microsoft`;
  },
};
