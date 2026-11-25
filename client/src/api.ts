export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export type AuthUser = {
  id: string;
  email: string;
};

type RequestOptions = {
  method?: string;
  body?: unknown;
};

function errorMessage(body: unknown, fallback: string) {
  if (
    body &&
    typeof body === "object" &&
    "error" in body &&
    typeof body.error === "string" &&
    body.error.length > 0
  ) {
    return body.error;
  }
  return fallback;
}

export async function api<T>(path: string, options?: RequestOptions): Promise<T> {
  const hasBody = options?.body !== undefined;
  const response = await fetch(path, {
    method: options?.method ?? "GET",
    credentials: "same-origin",
    headers: hasBody ? { "Content-Type": "application/json" } : undefined,
    body: hasBody ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      parsed = null;
    }
  }

  if (!response.ok) {
    throw new ApiError(response.status, errorMessage(parsed, "Request failed"));
  }

  return parsed as T;
}
