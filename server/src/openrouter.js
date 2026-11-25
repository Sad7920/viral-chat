const COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions";

export const RATE_LIMIT_MESSAGE = "The model is rate limited right now. Try again shortly.";

export class UpstreamError extends Error {
  constructor(message, { status, beforeStream }) {
    super(message);
    this.name = "UpstreamError";
    this.status = status;
    this.beforeStream = beforeStream;
  }
}

function clip(value) {
  return value.trim().slice(0, 300);
}

function errorEvent(error) {
  if (typeof error === "string" && error.trim()) {
    return { type: "error", message: clip(error), status: 502 };
  }
  const code = error && typeof error === "object" ? error.code : undefined;
  if (code === 429 || code === "429") {
    return { type: "error", message: RATE_LIMIT_MESSAGE, status: 429 };
  }
  const message =
    error && typeof error === "object" && typeof error.message === "string" && error.message.trim()
      ? clip(error.message)
      : "Upstream request failed";
  return { type: "error", message, status: 502 };
}

// Only delta.content is the reply. OpenRouter puts chain-of-thought on
// delta.reasoning and delta.reasoning_details, which this ignores.
export function readSsePayload(data) {
  if (data === "[DONE]") return { type: "done" };
  let json;
  try {
    json = JSON.parse(data);
  } catch {
    return { type: "ignore" };
  }
  if (!json || typeof json !== "object") return { type: "ignore" };
  if (json.error) return errorEvent(json.error);
  const content = json.choices?.[0]?.delta?.content;
  if (typeof content === "string" && content.length > 0) return { type: "delta", text: content };
  return { type: "ignore" };
}

export function createSseParser() {
  let buffer = "";
  let dataLines = [];

  function consume(line) {
    if (line.endsWith("\r")) line = line.slice(0, -1);
    if (line === "") {
      if (dataLines.length === 0) return null;
      const payload = dataLines.join("\n");
      dataLines = [];
      return payload;
    }
    if (line.startsWith(":")) return null;
    if (line.startsWith("data:")) {
      let value = line.slice(5);
      if (value.startsWith(" ")) value = value.slice(1);
      dataLines.push(value);
    }
    return null;
  }

  return {
    push(chunk) {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      const payloads = [];
      for (const line of lines) {
        const payload = consume(line);
        if (payload !== null) payloads.push(payload);
      }
      return payloads;
    },
    finish() {
      const payloads = this.push("\n");
      if (dataLines.length > 0) {
        payloads.push(dataLines.join("\n"));
        dataLines = [];
      }
      buffer = "";
      return payloads;
    },
  };
}

function applyPayloads(payloads) {
  const deltas = [];
  for (const payload of payloads) {
    const event = readSsePayload(payload);
    if (event.type === "done") return { deltas, done: true };
    if (event.type === "error") return { deltas, error: event };
    if (event.type === "delta") deltas.push(event.text);
  }
  return { deltas, done: false };
}

async function request(env, fetchImpl, { model, messages, stream, maxTokens, signal }) {
  const payload = { model, messages, stream };
  if (maxTokens !== undefined) payload.max_tokens = maxTokens;
  try {
    return await fetchImpl(COMPLETIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal,
    });
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    throw new UpstreamError("Upstream request failed", { status: 502, beforeStream: true });
  }
}

async function upstreamFailure(response) {
  let message = "Upstream request failed";
  try {
    const body = await response.json();
    const error = body?.error;
    if (response.status === 429) {
      throw new UpstreamError(RATE_LIMIT_MESSAGE, { status: 429, beforeStream: true });
    }
    if (typeof error?.message === "string" && error.message.trim()) message = clip(error.message);
    else if (typeof error === "string" && error.trim()) message = clip(error);
  } catch (err) {
    if (err instanceof UpstreamError) throw err;
  }
  if (response.status === 429) {
    throw new UpstreamError(RATE_LIMIT_MESSAGE, { status: 429, beforeStream: true });
  }
  throw new UpstreamError(message, { status: 502, beforeStream: true });
}

export function createOpenRouter(env, fetchImpl = globalThis.fetch) {
  return {
    async *streamCompletion({ model, messages, signal }) {
      const response = await request(env, fetchImpl, { model, messages, stream: true, signal });
      if (!response.ok) await upstreamFailure(response);
      if (!response.body) {
        throw new UpstreamError("Upstream request failed", { status: 502, beforeStream: true });
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const parser = createSseParser();
      try {
        while (true) {
          const { value, done } = await reader.read();
          const text = value ? decoder.decode(value, { stream: !done }) : decoder.decode();
          const payloads = parser.push(text);
          if (done) payloads.push(...parser.finish());
          const step = applyPayloads(payloads);
          for (const delta of step.deltas) yield delta;
          if (step.error) {
            throw new UpstreamError(step.error.message, {
              status: step.error.status,
              beforeStream: false,
            });
          }
          if (step.done || done) return;
        }
      } finally {
        reader.cancel().catch(() => {});
      }
    },
    async completeOnce({ model, messages, maxTokens }) {
      const response = await request(env, fetchImpl, {
        model,
        messages,
        stream: false,
        maxTokens,
      });
      if (!response.ok) await upstreamFailure(response);
      const json = await response.json();
      const content = json?.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) {
        throw new UpstreamError("Upstream request failed", { status: 502, beforeStream: true });
      }
      return content.trim();
    },
  };
}
