import { apiClient, ApiError } from '../api/client';

export { apiClient, ApiError };

export async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const { headers, body, method = 'GET', ...rest } = options;
  let parsedBody: any = body;
  if (typeof body === 'string') {
    try {
      parsedBody = JSON.parse(body);
    } catch {
      parsedBody = body;
    }
  }

  return apiClient<T>(endpoint, {
    method,
    headers: headers as Record<string, string>,
    body: parsedBody,
    ...rest,
  });
}
