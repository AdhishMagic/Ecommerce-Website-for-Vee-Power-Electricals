import { apiClient, setAuthTokens } from './client';
import {
  NotificationSettings,
  NotificationSettingsPatch,
  PasswordChangeInput,
  PasswordChangeResult,
  SecurityOverview,
  SystemInformation,
} from '../types/api';

/**
 * Admin Settings API.
 *
 * Every endpoint here is gated server-side by the project's existing
 * `IsAdminUser` permission (401 unauthenticated / 403 non-administrator). The
 * company/store configuration and the administrator profile are *not* re-defined
 * here — they keep their authoritative homes (`configApi.getStoreProfile` and
 * `authApi.getMe`/`updateProfile`) so there is exactly one source of truth per
 * business concept.
 */
export const settingsApi = {
  // Outbound notification policy -------------------------------------------
  async getNotificationSettings(): Promise<NotificationSettings> {
    return apiClient<NotificationSettings>('/settings/notifications/');
  },

  async updateNotificationSettings(
    patch: NotificationSettingsPatch
  ): Promise<NotificationSettings> {
    return apiClient<NotificationSettings>('/settings/notifications/', {
      method: 'PATCH',
      body: patch,
    });
  },

  // Security ---------------------------------------------------------------
  async getSecurityOverview(): Promise<SecurityOverview> {
    return apiClient<SecurityOverview>('/settings/security/');
  },

  /**
   * Rotates the administrator password. The backend verifies the current
   * credential, applies the configured Django password validators, hashes the new
   * password, revokes every existing refresh session, and returns a fresh token
   * pair following the existing SimpleJWT policy. Those tokens replace the stored
   * ones so the current session continues uninterrupted.
   */
  async changePassword(input: PasswordChangeInput): Promise<PasswordChangeResult> {
    const result = await apiClient<PasswordChangeResult>('/settings/change-password/', {
      method: 'POST',
      body: input,
    });
    if (result.access) {
      setAuthTokens(result.access, result.refresh);
    }
    return result;
  },

  /** Blacklists every outstanding refresh token, then continues this session. */
  async revokeOtherSessions(): Promise<PasswordChangeResult> {
    const result = await apiClient<PasswordChangeResult>('/settings/security/revoke-sessions/', {
      method: 'POST',
    });
    if (result.access) {
      setAuthTokens(result.access, result.refresh);
    }
    return result;
  },

  // System -----------------------------------------------------------------
  async getSystemInformation(): Promise<SystemInformation> {
    return apiClient<SystemInformation>('/settings/system/');
  },
};
