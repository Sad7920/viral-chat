import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, streamChat, type ChatMessage } from "@/api";
import { swapId } from "@/lib/lists";

const RATE_LIMIT_MESSAGE = "The model is rate limited right now. Try again shortly.";

export type StreamNotice = { tone: "error" | "warning"; message: string };

type Handlers = {
  model: string;
  onMeta: (conversationId: string) => void;
  onTitle: (conversationId: string, title: string) => void;
  refreshHistory: () => void;
};

function noticeFor(message: string): StreamNotice {
  if (message === RATE_LIMIT_MESSAGE) return { tone: "warning", message };
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

export function useChatStream(handlers: Handlers) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [notice, setNotice] = useState<StreamNotice | null>(null);
  const handlersRef = useRef(handlers);
  const abortRef = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const streamingRef = useRef(false);
  const mounted = useRef(true);

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

  const detach = useCallback(() => {
    generation.current += 1;
    streamingRef.current = false;
    setStreaming(false);
    abortRef.current?.abort();
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const send = useCallback((conversationId: string | null, content: string) => {
    const text = content.trim();
    const model = handlersRef.current.model;
    if (!text || !model || streamingRef.current) return;
    const gen = generation.current;
    const userId = `temp-${crypto.randomUUID()}`;
    const assistantId = `temp-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const controller = new AbortController();
    abortRef.current = controller;
    streamingRef.current = true;
    setStreaming(true);
    setNotice(null);
    setMessages((prev) => [
      ...prev,
      { id: userId, role: "user", content: text, model: null, incomplete: false, createdAt: now },
      {
        id: assistantId,
        role: "assistant",
        content: "",
        model,
        incomplete: false,
        createdAt: now,
      },
    ]);

    let activeId = conversationId;

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
        return prev.map((item) => (item.id === assistantId ? { ...item, incomplete: true } : item));
      });
    }

    void streamChat(
      "/chat/send",
      { conversationId, content: text, model },
      {
        signal: controller.signal,
        onEvent(frame) {
          if (generation.current !== gen) return;
          const data = readJson(frame.data);
          if (!data) return;
          if (frame.event === "meta") {
            const id = textOf(data, "conversationId");
            if (!id) return;
            activeId = id;
            handlersRef.current.onMeta(id);
            return;
          }
          if (frame.event === "token") {
            const delta = textOf(data, "text");
            if (!delta) return;
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
            if (title && activeId) handlersRef.current.onTitle(activeId, title);
            return;
          }
          if (frame.event === "error") {
            const message = textOf(data, "message") ?? "The model request failed";
            keepPartial();
            setNotice(noticeFor(message));
          }
        },
      },
    )
      .catch((err: unknown) => {
        if (!mounted.current) return;
        const left = generation.current !== gen;
        if (isAbort(err)) {
          if (!left) keepPartial();
          handlersRef.current.refreshHistory();
          return;
        }
        if (left) return;
        const status = err instanceof ApiError ? err.status : 0;
        dropAssistant(status === 400 || status === 401 || status === 404);
        const message = err instanceof ApiError ? err.message : "Something went wrong";
        setNotice(noticeFor(message));
        if (status === 429 || status === 502) handlersRef.current.refreshHistory();
      })
      .finally(() => {
        if (abortRef.current === controller) abortRef.current = null;
        streamingRef.current = false;
        if (mounted.current) setStreaming(false);
      });
  }, []);

  return { messages, streaming, notice, send, stop, detach, replaceMessages };
}
