export interface ApiErrorDetail {
  detail?: string;
  errors?: Record<string, string[] | string>;
  message?: string;
  [key: string]: any;
}

export class ApiError extends Error {
  status: number;
  data: ApiErrorDetail;
  fieldErrors: Record<string, string[]>;

  constructor(status: number, data: ApiErrorDetail) {
    const message =
      data.detail ||
      data.message ||
      (data.errors ? Object.values(data.errors).flat().join(' ') : null) ||
      `Request failed with status ${status}`;

    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
    this.fieldErrors = {};

    if (data.errors && typeof data.errors === 'object') {
      for (const [key, val] of Object.entries(data.errors)) {
        this.fieldErrors[key] = Array.isArray(val) ? val : [String(val)];
      }
    }
  }
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

  const response = await fetch(url, config);

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
    throw new ApiError(response.status, typeof responseData === 'object' ? responseData : { detail: responseData });
  }

  return responseData as T;
}
