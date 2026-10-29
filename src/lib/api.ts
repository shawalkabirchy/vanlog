export class RequestError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
    public fields: Record<string, string> = {},
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const read = !options.method || options.method === "GET";
  let lastError: unknown;
  for (let attempt = 0; attempt < (read ? 3 : 1); attempt++) {
    try {
      const response = await fetch(path, {
        ...options,
        credentials: "same-origin",
        headers: {
          ...(options.body ? { "Content-Type": "application/json" } : {}),
          ...options.headers,
        },
        signal: AbortSignal.timeout(15000),
        cache: "no-store",
      });
      if (response.status === 204) return undefined as T;
      const data = (await response.json()) as {
        error?: {
          message?: string;
          code?: string;
          fieldErrors?: Record<string, string>;
        };
      };
      if (!response.ok)
        throw new RequestError(
          data?.error?.message || "The request failed.",
          data?.error?.code || "REQUEST_FAILED",
          response.status,
          data?.error?.fieldErrors || {},
        );
      return data as T;
    } catch (error) {
      lastError = error;
      if (error instanceof RequestError && error.status < 500) throw error;
      if (!read) break;
      if (attempt < 2)
        await new Promise((resolve) =>
          setTimeout(resolve, attempt === 0 ? 1000 : 3000),
        );
    }
  }
  if (lastError instanceof RequestError) throw lastError;
  throw new RequestError(
    "The connection was interrupted. Your values are still here; retry to check whether they were saved.",
    "NETWORK_ERROR",
    0,
  );
}
export const send = <T>(path: string, method: string, data?: unknown) =>
  api<T>(path, {
    method,
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
