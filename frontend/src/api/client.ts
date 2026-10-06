export interface CanonicalApiError {
  code: string;
  message: string;
  details?: Record<string, any>;
  request_id?: string;
}

export interface ApiErrorDetail {
  success?: boolean;
  error?: CanonicalApiError;
  detail?: string;
  errors?: Record<string, string[] | string>;
  message?: string;
  [key: string]: any;
}

export class ApiError extends Error {
  status: number;
  data: ApiErrorDetail;
  fieldErrors: Record<string, string[]>;
  code: string;
  requestId?: string;

  constructor(status: number, data: ApiErrorDetail, requestId?: string) {
    const canonical = data.error;
    let message = canonical?.message || data.detail || data.message;

    const parsedFieldErrors: Record<string, string[]> = {};
    const rawErrors = canonical?.details || data.errors;
    const fieldMessages: string[] = [];

    if (rawErrors && typeof rawErrors === 'object') {
      for (const [key, val] of Object.entries(rawErrors)) {
        const arr = Array.isArray(val) ? val.map(String) : [String(val)];
        parsedFieldErrors[key] = arr;
        const joined = arr.join(' ');
        if (key === 'non_field_errors' || key === 'detail') {
          fieldMessages.push(joined);
        } else {
          const friendlyKey = key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
          fieldMessages.push(`${friendlyKey}: ${joined}`);
        }
      }
    }

    if (fieldMessages.length > 0 && (!message || message === 'Validation failed.' || message === 'Bad request.' || message === 'Invalid input.')) {
      message = fieldMessages.join(' | ');
    }

    if (!message && data.errors && typeof data.errors === 'object') {
      message = Object.values(data.errors).flat().join(' ');
    }

    if (!message) {
      if (status === 0) message = 'Network connection failed. Please check your network and try again.';
      else if (status === 400) message = 'Bad request. Please verify the submitted data.';
      else if (status === 401) message = 'Authentication required. Please log in.';
      else if (status === 403) message = 'Access denied. You do not have permission to perform this action.';
      else if (status === 404) message = 'The requested resource was not found.';
      else if (status === 409) message = 'A data conflict occurred. Please review and try again.';
      else if (status === 422) message = 'Validation failed. Please verify the submitted data.';
      else if (status === 429) message = 'Too many requests. Please slow down and try again.';
      else if (status === 503) message = 'Service temporarily unavailable. Please try again later.';
      else if (status >= 500) message = 'An unexpected server error occurred. Please try again later.';
      else message = `Request failed with status ${status}`;
    }

    const getDefaultCode = (codeStatus: number): string => {
      if (codeStatus === 0) return 'NETWORK_ERROR';
      if (codeStatus === 400) return 'BAD_REQUEST';
      if (codeStatus === 401) return 'UNAUTHORIZED';
      if (codeStatus === 403) return 'FORBIDDEN';
      if (codeStatus === 404) return 'NOT_FOUND';
      if (codeStatus === 409) return 'CONFLICT';
      if (codeStatus === 422) return 'VALIDATION_ERROR';
      if (codeStatus === 429) return 'RATE_LIMITED';
      if (codeStatus === 503) return 'SERVICE_UNAVAILABLE';
      if (codeStatus >= 500) return 'SERVER_ERROR';
      return 'ERROR';
    };

    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
    this.code = canonical?.code || getDefaultCode(status);
    this.requestId = canonical?.request_id || requestId;
    this.fieldErrors = parsedFieldErrors;
  }
}

export interface NormalizedError {
  message: string;
  code: string;
  status: number;
  fieldErrors: Record<string, string[]>;
  requestId?: string;
}

export function normalizeApiError(err: unknown): NormalizedError {
  if (err instanceof ApiError) {
    return {
      message: err.message,
      code: err.code,
      status: err.status,
      fieldErrors: err.fieldErrors,
      requestId: err.requestId,
    };
  }
  if (err instanceof Error) {
    return {
      message: err.message || 'An unexpected client error occurred.',
      code: 'CLIENT_ERROR',
      status: 0,
      fieldErrors: {},
    };
  }
  return {
    message: 'An unknown error occurred.',
    code: 'UNKNOWN_ERROR',
    status: 0,
    fieldErrors: {},
  };
}

const getApiBaseUrl = (): string => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl) {
    return envUrl.replace(/\/+$/, '');
  }
  return 'http://localhost:8000/api/v1';
};

export const API_BASE_URL = getApiBaseUrl();

// Storage keys
export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'auth_access_token',
  REFRESH_TOKEN: 'auth_refresh_token',
  LEGACY_TOKEN: 'auth_token',
  USER: 'vp_user',
  ROLE: 'vp_role',
};

export const getAccessToken = (): string | null => {
  return (
    localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN) ||
    sessionStorage.getItem('vp_token') ||
    localStorage.getItem(STORAGE_KEYS.LEGACY_TOKEN)
  );
};

export const getRefreshToken = (): string | null => {
  return (
    localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN) ||
    sessionStorage.getItem('vp_refresh_token')
  );
};

// A freshly stored token pair means there is a live session again, so re-arm the
// one-shot "session expired" notification for any later failure.
let sessionExpiredNotified = false;

export const setAuthTokens = (access: string, refresh?: string): void => {
  sessionExpiredNotified = false;
  localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, access);
  localStorage.setItem(STORAGE_KEYS.LEGACY_TOKEN, access);
  sessionStorage.setItem('vp_token', access);

  if (refresh) {
    localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, refresh);
    sessionStorage.setItem('vp_refresh_token', refresh);
  }
};

export const clearAuthStorage = (): void => {
  localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
  localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
  localStorage.removeItem(STORAGE_KEYS.LEGACY_TOKEN);
  localStorage.removeItem(STORAGE_KEYS.USER);
  localStorage.removeItem(STORAGE_KEYS.ROLE);

  sessionStorage.removeItem('vp_token');
  sessionStorage.removeItem('vp_refresh_token');
  sessionStorage.removeItem('vp_user');
  sessionStorage.removeItem('vp_role');
};

// Ends the session exactly once, no matter how many requests were in flight when
// it was discovered. Without this, N concurrent 401s produced N redirects, and a
// request that could not be recovered was silently retried forever.
const notifySessionExpired = (): void => {
  const hadSession = !!(getAccessToken() || getRefreshToken());
  clearAuthStorage();
  if (!hadSession || sessionExpiredNotified) return;
  sessionExpiredNotified = true;
  window.dispatchEvent(new CustomEvent('auth_session_expired'));
};

const postTokenRefresh = async (
  refreshToken: string
): Promise<{ access: string; refresh?: string } | null> => {
  try {
    const res = await fetch(`${API_BASE_URL}/auth/token/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ refresh: refreshToken }),
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!data?.access) return null;
    return { access: data.access, refresh: data.refresh };
  } catch {
    return null;
  }
};

// Single-flight refresh. The backend rotates and blacklists refresh tokens, so two
// concurrent refreshes with the same token would make the loser 401 and needlessly
// destroy a perfectly valid session. Every concurrent 401 awaits this one promise.
let refreshPromise: Promise<string> | null = null;

const refreshAccessToken = (): Promise<string> => {
  if (refreshPromise) return refreshPromise;

  const tokenAtStart = getRefreshToken();
  if (!tokenAtStart) {
    return Promise.reject(new ApiError(401, { detail: 'No refresh token is available.' }));
  }

  const attempt = (async (): Promise<string> => {
    let result = await postTokenRefresh(tokenAtStart);

    if (!result) {
      // Another tab or page load may have rotated first, which blacklists the token
      // we just sent. If storage now holds a different refresh token, adopt it rather
      // than declaring a valid session dead.
      const latest = getRefreshToken();
      if (latest && latest !== tokenAtStart) {
        result = await postTokenRefresh(latest);
      }
    }

    if (!result) {
      throw new ApiError(401, { detail: 'Session expired. Please log in again.' });
    }

    setAuthTokens(result.access, result.refresh || tokenAtStart);
    return result.access;
  })();

  refreshPromise = attempt.finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
};

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  params?: Record<string, any>;
  body?: any;
  skipAuth?: boolean;
  timeoutMs?: number;
  _isRetry?: boolean;
}

export async function apiClient<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { params, body, headers = {}, skipAuth = false, timeoutMs = 30000, _isRetry = false, ...restOptions } = options;

  let url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

  if (params && Object.keys(params).length > 0) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        if (Array.isArray(value)) {
          value.forEach((v) => searchParams.append(key, String(v)));
        } else {
          searchParams.append(key, String(value));
        }
      }
    }
    const queryString = searchParams.toString();
    if (queryString) {
      url += (url.includes('?') ? '&' : '?') + queryString;
    }
  }

  const reqHeaders: Record<string, string> = {
    Accept: 'application/json',
  };

  const isFormData = body instanceof FormData;
  if (!isFormData && body !== undefined && !(headers as Record<string, string>)['Content-Type']) {
    reqHeaders['Content-Type'] = 'application/json';
  }

  if (!skipAuth) {
    const token = getAccessToken();
    if (token) {
      reqHeaders['Authorization'] = `Bearer ${token}`;
    }
  }

  // Ensure request ID is present for tracing
  if (!reqHeaders['X-Request-ID'] && !(headers as Record<string, string>)['X-Request-ID']) {
    reqHeaders['X-Request-ID'] = `req_fe_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
  }

  // Merge custom headers
  Object.assign(reqHeaders, headers);

  // Setup abort controller for timeout
  const controller = new AbortController();
  const timeoutId = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;
  if (restOptions.signal) {
    restOptions.signal.addEventListener('abort', () => controller.abort());
  }

  const config: RequestInit = {
    ...restOptions,
    headers: reqHeaders,
    signal: controller.signal,
    body: isFormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
  };

  let response: Response;
  try {
    response = await fetch(url, config);
  } catch (networkErr: any) {
    if (controller.signal.aborted) {
      const err = new ApiError(0, {
        detail: `Request timed out after ${timeoutMs / 1000}s. Please check your network and try again.`,
      });
      err.code = 'TIMEOUT_ERROR';
      throw err;
    }
    throw new ApiError(0, {
      detail: networkErr?.message || 'Network connection failed. Please check your internet connection.',
    });
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }

  // A 401 on an authenticated request means the stored session can no longer be
  // used. Refresh once (shared by every concurrent 401) and replay; if that is not
  // possible, end the session cleanly instead of letting every caller re-issue
  // unauthenticated requests that 401 again and again.
  if (response.status === 401 && !skipAuth && !_isRetry) {
    let newAccess: string;
    try {
      newAccess = await refreshAccessToken();
    } catch {
      notifySessionExpired();
      throw new ApiError(401, { detail: 'Session expired. Please log in again.' });
    }

    return apiClient<T>(endpoint, {
      ...options,
      headers: { ...(headers as Record<string, string>), Authorization: `Bearer ${newAccess}` },
      _isRetry: true,
    });
  }

  // Check if response is 204 No Content
  if (response.status === 204) {
    return {} as T;
  }

  // Parse JSON response
  let responseData: any;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    responseData = await response.json().catch(() => ({}));
  } else {
    responseData = await response.text();
  }

  if (!response.ok) {
    const requestId = response.headers.get('x-request-id') || (typeof responseData === 'object' && responseData?.error?.request_id) || undefined;
    throw new ApiError(
      response.status,
      typeof responseData === 'object' ? responseData : { detail: responseData },
      requestId
    );
  }

  return responseData as T;
}
