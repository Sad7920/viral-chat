import { parseSSE, type SseFrame } from "@/sse";

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

export type Persona = {
  agentName: string;
  companyName: string;
  greeting: string;
  suggestedPrompts: string[];
};

export type ModelInfo = {
  id: string;
  label: string;
};

export type ModelsResponse = {
  models: ModelInfo[];
  defaultModel: string;
};

export type ConversationSummary = {
  id: string;
  title: string;
  escalation: { summary: string; createdAt: string } | null;
  updatedAt: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  model: string | null;
  incomplete: boolean;
  createdAt: string;
};

export type Page<T> = {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
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

async function* readChunks(body: ReadableStream<Uint8Array>): AsyncGenerator<Uint8Array> {
  const reader = body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      if (value) yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

export async function streamChat(
  path: string,
  body: unknown,
  options: { signal: AbortSignal; onEvent: (frame: SseFrame) => void },
): Promise<void> {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: options.signal,
  });

  if (!response.ok) {
    const text = await response.text();
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text) as unknown;
      } catch {
        parsed = null;
      }
    }
    throw new ApiError(response.status, errorMessage(parsed, "Request failed"));
  }

  if (!response.body) throw new ApiError(502, "Empty response");

  for await (const frame of parseSSE(readChunks(response.body))) {
    options.onEvent(frame);
  }
}
