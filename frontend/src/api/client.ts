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
      else if (status === 429) message = 'Too many requests. Please slow down and try again.';
      else if (status >= 500) message = 'An unexpected server error occurred. Please try again later.';
      else message = `Request failed with status ${status}`;
    }

    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
    this.code = canonical?.code || (status === 0 ? 'NETWORK_ERROR' : 'ERROR');
    this.requestId = canonical?.request_id || requestId;
    this.fieldErrors = {};

    const rawErrors = canonical?.details || data.errors;
    if (rawErrors && typeof rawErrors === 'object') {
      for (const [key, val] of Object.entries(rawErrors)) {
        this.fieldErrors[key] = Array.isArray(val) ? val.map(String) : [String(val)];
      }
    }
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

export const setAuthTokens = (access: string, refresh?: string): void => {
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

let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

const subscribeTokenRefresh = (cb: (token: string) => void) => {
  refreshSubscribers.push(cb);
};

const onTokenRefreshed = (token: string) => {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
};

const onRefreshFailed = () => {
  refreshSubscribers = [];
  clearAuthStorage();
  window.dispatchEvent(new CustomEvent('auth_session_expired'));
};

interface RequestOptions extends Omit<RequestInit, 'body'> {
  params?: Record<string, any>;
  body?: any;
  skipAuth?: boolean;
  _isRetry?: boolean;
}

export async function apiClient<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { params, body, headers = {}, skipAuth = false, _isRetry = false, ...restOptions } = options;

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

  // Merge custom headers
  Object.assign(reqHeaders, headers);

  const config: RequestInit = {
    ...restOptions,
    headers: reqHeaders,
    body: isFormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
  };

  let response: Response;
  try {
    response = await fetch(url, config);
  } catch (networkErr: any) {
    throw new ApiError(0, {
      detail: networkErr?.message || 'Network connection failed. Please check your internet connection.',
    });
  }

  // Handle 401 Unauthorized for token refresh
  if (response.status === 401 && !skipAuth && !_isRetry) {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      if (!isRefreshing) {
        isRefreshing = true;
        try {
          const refreshRes = await fetch(`${API_BASE_URL}/auth/token/refresh/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ refresh: refreshToken }),
          });

          if (refreshRes.ok) {
            const data = await refreshRes.json();
            const newAccess = data.access;
            const newRefresh = data.refresh || refreshToken;
            setAuthTokens(newAccess, newRefresh);
            isRefreshing = false;
            onTokenRefreshed(newAccess);

            // Replay original request
            return apiClient<T>(endpoint, { ...options, _isRetry: true });
          } else {
            isRefreshing = false;
            onRefreshFailed();
            throw new ApiError(401, { detail: 'Session expired. Please log in again.' });
          }
        } catch (err) {
          isRefreshing = false;
          onRefreshFailed();
          throw err instanceof ApiError ? err : new ApiError(401, { detail: 'Session refresh failed.' });
        }
      } else {
        // Queue this request until refresh completes
        return new Promise<T>((resolve, reject) => {
          subscribeTokenRefresh((newAccessToken: string) => {
            apiClient<T>(endpoint, {
              ...options,
              headers: { ...headers, Authorization: `Bearer ${newAccessToken}` },
              _isRetry: true,
            })
              .then(resolve)
              .catch(reject);
          });
        });
      }
    }
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
