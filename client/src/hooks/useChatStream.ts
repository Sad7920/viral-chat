import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiError,
  api,
  streamChat,
  type ChatMessage,
  type ConversationSummary,
  type Page,
} from "@/api";
import { prependOlder, swapId } from "@/lib/lists";

const RATE_LIMIT_MESSAGE = "The model is rate limited right now. Try again shortly.";

export type StreamNotice = { tone: "error" | "warning" | "stopped"; message: string };

type Handlers = {
  model: string;
  onMeta: (conversationId: string) => void;
  onTitle: (conversationId: string, title: string) => void;
  refreshHistory: () => void;
  conversationIds: () => readonly string[];
};

function noticeFor(message: string, status = 0): StreamNotice {
  if (status === 429 || message === RATE_LIMIT_MESSAGE) return { tone: "warning", message };
  return { tone: "error", message };
}

function isAbort(err: unknown) {
  return err instanceof Error && err.name === "AbortError";
}

function readJson(data: string) {
  try {
    const value = JSON.parse(data) as unknown;
    if (!value || typeof value !== "object") return null;
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}

function textOf(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function placeholder(id: string, model: string, now: string): ChatMessage {
  return {
    id,
    role: "assistant",
    content: "",
    model: model || null,
    incomplete: false,
    createdAt: now,
  };
}

export function useChatStream(handlers: Handlers) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [notice, setNotice] = useState<StreamNotice | null>(null);
  const handlersRef = useRef(handlers);
  const abortRef = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const streamingRef = useRef(false);
  const mounted = useRef(true);
  const conversationRef = useRef<string | null>(null);
  const knownRef = useRef<ReadonlySet<string>>(new Set());

  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current += 1;
      abortRef.current?.abort();
    };
  }, []);

  const replaceMessages = useCallback((next: ChatMessage[]) => {
    setMessages(next);
    setNotice(null);
  }, []);

  const prependMessages = useCallback((older: readonly ChatMessage[]) => {
    setMessages((prev) => prependOlder(prev, older));
  }, []);

  const detach = useCallback(() => {
    generation.current += 1;
    streamingRef.current = false;
    setStreaming(false);
    abortRef.current?.abort();
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const adoptCreated = useCallback(async (gen: number) => {
    const page = await api<Page<ConversationSummary>>("/chat/history?limit=20");
    if (generation.current !== gen || !mounted.current) return undefined;
    const created = page.items
      .filter((item) => !knownRef.current.has(item.id))
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    const id = created[0]?.id ?? null;
    if (id) {
      conversationRef.current = id;
      handlersRef.current.onMeta(id);
    }
    return id;
  }, []);

  const run = useCallback(
    (
      pathFor: (id: string | null) => string,
      body: unknown,
      active: { id: string | null },
      assistantId: string,
      userId: string | null,
      needsId: boolean,
    ) => {
      const gen = generation.current;
      const controller = new AbortController();
      abortRef.current = controller;
      let gotText = false;

      function dropAssistant(dropUser: boolean) {
        setMessages((prev) =>
          prev.filter((item) => item.id !== assistantId && (!dropUser || item.id !== userId)),
        );
      }

      function keepPartial() {
        setMessages((prev) => {
          const assistant = prev.find((item) => item.id === assistantId);
          if (!assistant) return prev;
          if (!assistant.content) return prev.filter((item) => item.id !== assistantId);
          return prev.map((item) =>
            item.id === assistantId ? { ...item, incomplete: true } : item,
          );
        });
      }

      void (async () => {
        let id = active.id ?? conversationRef.current;
        if (!id && needsId) {
          const found = await adoptCreated(gen);
          if (found === undefined) return;
          id = found;
        }
        if (generation.current !== gen) return;
        if (needsId && !id) throw new ApiError(404, "Not found");
        if (id) {
          active.id = id;
          conversationRef.current = id;
        }
        await streamChat(pathFor(id), body, {
          signal: controller.signal,
          onEvent(frame) {
            if (generation.current !== gen) return;
            const data = readJson(frame.data);
            if (!data) return;
            if (frame.event === "meta") {
              const next = textOf(data, "conversationId");
              if (!next) return;
              active.id = next;
              conversationRef.current = next;
              handlersRef.current.onMeta(next);
              return;
            }
            if (frame.event === "token") {
              const delta = textOf(data, "text");
              if (!delta) return;
              gotText = true;
              setMessages((prev) =>
                prev.map((item) =>
                  item.id === assistantId ? { ...item, content: item.content + delta } : item,
                ),
              );
              return;
            }
            if (frame.event === "done") {
              const messageId = textOf(data, "messageId");
              if (!messageId) return;
              setMessages((prev) =>
                swapId(prev, assistantId, messageId).map((item) =>
                  item.id === messageId ? { ...item, incomplete: data.incomplete === true } : item,
                ),
              );
              return;
            }
            if (frame.event === "title") {
              const title = textOf(data, "title");
              if (title && active.id) handlersRef.current.onTitle(active.id, title);
              return;
            }
            if (frame.event === "error") {
              const message = textOf(data, "message") ?? "The model request failed";
              keepPartial();
              setNotice(noticeFor(message));
            }
          },
        });
      })()
        .catch((err: unknown) => {
          if (!mounted.current || generation.current !== gen) return;
          if (isAbort(err)) {
            keepPartial();
            if (!gotText) setNotice({ tone: "stopped", message: "Stopped before a reply" });
            handlersRef.current.refreshHistory();
            return;
          }
          const status = err instanceof ApiError ? err.status : 0;
          dropAssistant(Boolean(userId) && (status === 400 || status === 401 || status === 404));
          const message = err instanceof ApiError ? err.message : "Something went wrong";
          setNotice(noticeFor(message, status));
          if ((status === 429 || status === 502) && !active.id) {
            void adoptCreated(gen);
          }
          if (status === 429 || status === 502) handlersRef.current.refreshHistory();
        })
        .finally(() => {
          if (abortRef.current === controller) abortRef.current = null;
          streamingRef.current = false;
          if (mounted.current && generation.current === gen) setStreaming(false);
        });
    },
    [adoptCreated],
  );

  const send = useCallback(
    (conversationId: string | null, content: string) => {
      const text = content.trim();
      const model = handlersRef.current.model;
      if (!text || !model || streamingRef.current) return;
      const userId = `temp-${crypto.randomUUID()}`;
      const assistantId = `temp-${crypto.randomUUID()}`;
      const now = new Date().toISOString();
      knownRef.current = new Set(handlersRef.current.conversationIds());
      conversationRef.current = conversationId;
      streamingRef.current = true;
      setStreaming(true);
      setNotice(null);
      setMessages((prev) => [
        ...prev,
        { id: userId, role: "user", content: text, model: null, incomplete: false, createdAt: now },
        placeholder(assistantId, model, now),
      ]);
      run(
        () => "/chat/send",
        { conversationId, content: text, model },
        { id: conversationId },
        assistantId,
        userId,
        false,
      );
    },
    [run],
  );

  const retry = useCallback(
    (conversationId: string | null) => {
      if (streamingRef.current) return;
      const model = handlersRef.current.model;
      const assistantId = `temp-${crypto.randomUUID()}`;
      const now = new Date().toISOString();
      const active = { id: conversationId ?? conversationRef.current };
      streamingRef.current = true;
      setStreaming(true);
      setNotice(null);
      setMessages((prev) => {
        const next = placeholder(assistantId, model, now);
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && (last.incomplete || last.content === "")) {
          return [...prev.slice(0, -1), next];
        }
        return [...prev, next];
      });
      run((id) => `/chat/conversations/${id ?? ""}/retry`, {}, active, assistantId, null, true);
    },
    [run],
  );

  return {
    messages,
    streaming,
    notice,
    send,
    stop,
    detach,
    replaceMessages,
    prependMessages,
    retry,
  };
}
