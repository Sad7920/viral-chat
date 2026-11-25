import { ChevronDown, Menu } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useMatch, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  ApiError,
  api,
  type ChatMessage,
  type ConversationSummary,
  type ModelInfo,
  type ModelsResponse,
  type Page,
  type Persona,
} from "@/api";
import { Composer } from "@/components/Composer";
import { DeleteDialog } from "@/components/DeleteDialog";
import { EscalateDialog } from "@/components/EscalateDialog";
import { Sidebar } from "@/components/Sidebar";
import { StatusBadge } from "@/components/StatusBadge";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Thread } from "@/components/Thread";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAuth } from "@/auth";
import { useChatStream } from "@/hooks/useChatStream";
import { upsertById } from "@/lib/lists";

const MODEL_KEY = "lumen-model";

function mergeHistory(prev: readonly ConversationSummary[], items: readonly ConversationSummary[]) {
  return [...items]
    .reverse()
    .reduce<ConversationSummary[]>((acc, item) => upsertById(acc, item), [...prev]);
}

function storedModel() {
  try {
    return localStorage.getItem(MODEL_KEY);
  } catch {
    return null;
  }
}

function chooseModel(models: ModelInfo[], fallback: string) {
  const stored = storedModel();
  if (stored && models.some((model) => model.id === stored)) return stored;
  if (models.some((model) => model.id === fallback)) return fallback;
  return models[0]?.id ?? "";
}

function saveModel(id: string) {
  try {
    localStorage.setItem(MODEL_KEY, id);
  } catch {
    // A blocked store should not stop the current choice.
  }
}

function failure(err: unknown) {
  return err instanceof ApiError ? err.message : "Something went wrong";
}

type HistoryWalk = {
  items: ConversationSummary[];
  nextCursor: string | null;
  hasMore: boolean;
};

async function loadHistoryThrough(id: string): Promise<HistoryWalk | null> {
  const found: ConversationSummary[] = [];
  let cursor: string | null = null;
  const seen = new Set<string>();
  for (;;) {
    const query = cursor
      ? `/chat/history?limit=20&cursor=${encodeURIComponent(cursor)}`
      : "/chat/history?limit=20";
    const page: Page<ConversationSummary> = await api(query);
    found.push(...page.items);
    const hit = page.items.some((item) => item.id === id);
    if (hit || !page.hasMore || !page.nextCursor || seen.has(page.nextCursor)) {
      return hit ? { items: found, nextCursor: page.nextCursor, hasMore: page.hasMore } : null;
    }
    seen.add(page.nextCursor);
    cursor = page.nextCursor;
  }
}

export function Chat() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const matched = useMatch("/c/:conversationId");
  const selectedId = matched?.params.conversationId ?? null;
  const [persona, setPersona] = useState<Persona | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelId, setModelId] = useState("");
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyMoreLoading, setHistoryMoreLoading] = useState(false);
  const [historyMoreError, setHistoryMoreError] = useState("");
  const [messagesLoading, setMessagesLoading] = useState(Boolean(selectedId));
  const [messageHasMore, setMessageHasMore] = useState(false);
  const [olderError, setOlderError] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadNonce, setLoadNonce] = useState(0);
  const [logoutError, setLogoutError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [escalateOpen, setEscalateOpen] = useState(false);
  const deleteReturn = useRef<HTMLButtonElement | null>(null);
  const escalateReturn = useRef<HTMLButtonElement | null>(null);
  const request = useRef(0);
  const createdId = useRef<string | null>(null);
  const historyPaging = useRef({ cursor: null as string | null, hasMore: false, depth: 0 });
  const historyLock = useRef(false);
  const messagePage = useRef({
    token: 0,
    id: null as string | null,
    cursor: null as string | null,
    hasMore: false,
  });
  const olderLock = useRef(0);
  const conversationIds = useCallback(() => conversations.map((item) => item.id), [conversations]);

  const onMeta = useCallback(
    (id: string) => {
      setConversations((prev) => {
        const existing = prev.find((item) => item.id === id);
        const row = existing ?? {
          id,
          title: "New chat",
          escalation: null,
          updatedAt: new Date().toISOString(),
        };
        return [row, ...prev.filter((item) => item.id !== id)];
      });
      if (selectedId === id) return;
      createdId.current = id;
      navigate(`/c/${id}`, { replace: true });
    },
    [navigate, selectedId],
  );

  const onTitle = useCallback((id: string, title: string) => {
    setConversations((prev) => prev.map((item) => (item.id === id ? { ...item, title } : item)));
  }, []);

  const refreshHistory = useCallback(() => {
    // Title and partial are saved after the socket closes, so wait for that write.
    window.setTimeout(() => {
      void api<Page<ConversationSummary>>("/chat/history?limit=20")
        .then((page) => setConversations((prev) => mergeHistory(prev, page.items)))
        .catch(() => undefined);
    }, 500);
  }, []);

  const handlers = useMemo(
    () => ({ model: modelId, onMeta, onTitle, refreshHistory, conversationIds }),
    [modelId, onMeta, onTitle, refreshHistory, conversationIds],
  );
  const stream = useChatStream(handlers);
  const { detach, replaceMessages, prependMessages } = stream;
  const active = conversations.find((item) => item.id === selectedId) ?? null;
  const escalated = Boolean(active?.escalation);
  const lastMessage = stream.messages.at(-1);
  const canRetry =
    !stream.streaming &&
    Boolean(selectedId) &&
    (stream.notice !== null || (lastMessage?.role === "assistant" && lastMessage.incomplete));

  useEffect(() => {
    if (persona) document.title = persona.companyName;
  }, [persona]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api<Persona>("/persona"),
      api<ModelsResponse>("/models"),
      api<Page<ConversationSummary>>("/chat/history?limit=20"),
    ])
      .then(([nextPersona, nextModels, history]) => {
        if (cancelled) return;
        setPersona(nextPersona);
        setModels(nextModels.models);
        setModelId(chooseModel(nextModels.models, nextModels.defaultModel));
        setConversations((prev) =>
          prev.length === 0 ? history.items : mergeHistory(prev, history.items),
        );
        if (historyPaging.current.depth <= history.items.length) {
          historyPaging.current = {
            cursor: history.nextCursor,
            hasMore: history.hasMore,
            depth: Math.max(historyPaging.current.depth, history.items.length),
          };
          setHistoryHasMore(history.hasMore);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setHistoryError(failure(err));
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    void loadHistoryThrough(selectedId)
      .then((walk) => {
        if (cancelled || !walk) return;
        if (walk.items.length > historyPaging.current.depth) {
          historyPaging.current = {
            cursor: walk.nextCursor,
            hasMore: walk.hasMore,
            depth: walk.items.length,
          };
          setHistoryHasMore(walk.hasMore);
        }
        setConversations((prev) => {
          if (prev.some((item) => item.id === selectedId)) return prev;
          const known = new Set(prev.map((item) => item.id));
          const extra = walk.items.filter((item) => !known.has(item.id));
          return extra.length === 0 ? prev : [...prev, ...extra];
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  useLayoutEffect(() => {
    if (selectedId && createdId.current === selectedId) return;
    createdId.current = null;
    const token = ++request.current;
    const id = selectedId;
    olderLock.current = 0;
    messagePage.current = { token, id, cursor: null, hasMore: false };
    detach();
    // Follow the URL, including Back and Forward, without painting the previous thread.
    queueMicrotask(() => {
      if (request.current !== token) return;
      setLoadError(null);
      setOlderError("");
      setMessageHasMore(false);
      if (!id) {
        setMessagesLoading(false);
        replaceMessages([]);
        return;
      }
      setMessagesLoading(true);
      replaceMessages([]);
      void api<Page<ChatMessage>>(`/chat/conversations/${id}/messages?limit=30`)
        .then((page) => {
          if (request.current !== token) return;
          messagePage.current = {
            token,
            id,
            cursor: page.nextCursor,
            hasMore: page.hasMore,
          };
          setMessageHasMore(page.hasMore);
          replaceMessages(page.items.slice().reverse());
        })
        .catch((err: unknown) => {
          if (request.current !== token) return;
          replaceMessages([]);
          if (err instanceof ApiError && err.status === 404) {
            toast("Conversation not found");
            navigate("/", { replace: true });
            return;
          }
          setLoadError(failure(err));
        })
        .finally(() => {
          if (request.current === token) setMessagesLoading(false);
        });
    });
    return () => {
      request.current += 1;
    };
  }, [selectedId, loadNonce, detach, replaceMessages, navigate]);

  const loadOlder = useCallback(() => {
    const page = messagePage.current;
    const token = page.token;
    const id = page.id;
    const cursor = page.cursor;
    if (!id || !page.hasMore || !cursor || request.current !== token) return;
    if (olderLock.current === token) return;
    olderLock.current = token;
    setOlderError("");
    void api<Page<ChatMessage>>(
      `/chat/conversations/${id}/messages?limit=30&cursor=${encodeURIComponent(cursor)}`,
    )
      .then((next) => {
        if (request.current !== token || messagePage.current.token !== token) return;
        messagePage.current = { token, id, cursor: next.nextCursor, hasMore: next.hasMore };
        setMessageHasMore(next.hasMore);
        prependMessages(next.items.slice().reverse());
      })
      .catch((err: unknown) => {
        if (request.current !== token) return;
        setOlderError(failure(err));
      })
      .finally(() => {
        if (olderLock.current === token) olderLock.current = 0;
      });
  }, [prependMessages]);

  const loadMore = useCallback(() => {
    const paging = historyPaging.current;
    if (historyLock.current || !paging.hasMore || !paging.cursor) return;
    historyLock.current = true;
    setHistoryMoreLoading(true);
    setHistoryMoreError("");
    void api<Page<ConversationSummary>>(
      `/chat/history?limit=20&cursor=${encodeURIComponent(paging.cursor)}`,
    )
      .then((page) => {
        setConversations((prev) => {
          const known = new Set(prev.map((item) => item.id));
          const extra = page.items.filter((item) => !known.has(item.id));
          return extra.length === 0 ? prev : [...prev, ...extra];
        });
        historyPaging.current = {
          cursor: page.nextCursor,
          hasMore: page.hasMore,
          depth: historyPaging.current.depth + page.items.length,
        };
        setHistoryHasMore(page.hasMore);
      })
      .catch((err: unknown) => setHistoryMoreError(failure(err)))
      .finally(() => {
        historyLock.current = false;
        setHistoryMoreLoading(false);
      });
  }, []);

  function select(id: string) {
    setMenuOpen(false);
    if (id === selectedId) {
      if (loadError) {
        createdId.current = null;
        setLoadNonce((nonce) => nonce + 1);
      }
      return;
    }
    navigate(`/c/${id}`);
  }

  function startNew() {
    setMenuOpen(false);
    if (!selectedId) {
      createdId.current = null;
      request.current += 1;
      detach();
      setLoadError(null);
      setMessagesLoading(false);
      replaceMessages([]);
      return;
    }
    navigate("/");
  }

  function send(content: string) {
    setLoadError(null);
    stream.send(selectedId, content);
  }

  function onLogout() {
    setLogoutError("");
    void logout().catch(() => setLogoutError("Could not log out"));
  }

  function askDelete(id: string, button: HTMLButtonElement) {
    deleteReturn.current = button;
    setDeleteId(id);
  }

  function confirmDelete() {
    if (!deleteId || deleting) return;
    const id = deleteId;
    setDeleting(true);
    void api(`/chat/conversations/${id}`, { method: "DELETE" })
      .then(() => {
        setConversations((prev) => prev.filter((item) => item.id !== id));
        setDeleteId(null);
        if (id === selectedId) navigate("/");
      })
      .catch((err: unknown) => toast(failure(err)))
      .finally(() => setDeleting(false));
  }

  function escalate(summary: string) {
    if (!selectedId) return Promise.reject(new Error("Start a chat first"));
    return api<ConversationSummary>(`/chat/conversations/${selectedId}/escalate`, {
      method: "POST",
      body: { summary },
    })
      .then((updated) => {
        setConversations((prev) =>
          prev.some((item) => item.id === updated.id)
            ? prev.map((item) =>
                item.id === updated.id ? { ...item, escalation: updated.escalation } : item,
              )
            : [updated, ...prev],
        );
      })
      .catch((err: unknown) => {
        toast(failure(err));
        throw err;
      });
  }

  const notice =
    stream.notice ?? (loadError ? { tone: "error" as const, message: loadError } : null);
  const showEmpty = Boolean(persona) && !messagesLoading && stream.messages.length === 0 && !notice;
  const sidebar = (
    <Sidebar
      companyName={persona?.companyName ?? ""}
      email={user?.email ?? ""}
      conversations={conversations}
      activeId={selectedId}
      loading={historyLoading}
      error={historyError}
      logoutError={logoutError}
      hasMore={historyHasMore}
      loadingMore={historyMoreLoading}
      moreError={historyMoreError}
      onNew={startNew}
      onSelect={select}
      onLoadMore={loadMore}
      onAskDelete={askDelete}
      onLogout={onLogout}
    />
  );

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <aside className="hidden h-full w-[260px] shrink-0 border-r border-sidebar-border bg-sidebar md:flex">
        {sidebar}
      </aside>
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-[260px] gap-0 p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Conversations</SheetTitle>
            <SheetDescription>Recent conversations</SheetDescription>
          </SheetHeader>
          <Sidebar
            companyName={persona?.companyName ?? ""}
            email={user?.email ?? ""}
            conversations={conversations}
            activeId={selectedId}
            loading={historyLoading}
            error={historyError}
            logoutError={logoutError}
            hasMore={historyHasMore}
            loadingMore={historyMoreLoading}
            moreError={historyMoreError}
            menuOffset
            onNew={startNew}
            onSelect={select}
            onLoadMore={loadMore}
            onAskDelete={askDelete}
            onLogout={onLogout}
          />
        </SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Open conversations"
            onClick={() => setMenuOpen(true)}
          >
            <Menu />
          </Button>
          <p className="min-w-0 shrink truncate text-base font-medium">{persona?.companyName}</p>
          <p className="hidden min-w-0 shrink truncate text-sm text-muted-foreground sm:block">
            {persona?.agentName}
          </p>
          {models.length > 0 ? (
            <div className="relative w-16 min-w-0 shrink sm:w-52">
              <select
                aria-label="Model"
                value={modelId}
                onChange={(event) => {
                  setModelId(event.target.value);
                  saveModel(event.target.value);
                }}
                className="h-8 w-full appearance-none truncate rounded-full border border-border-strong bg-transparent pr-8 pl-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                {models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label}
                  </option>
                ))}
              </select>
              <ChevronDown
                aria-hidden
                className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              />
            </div>
          ) : null}
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <span title={selectedId ? undefined : "Start a chat first"} className="inline-flex">
              <Button
                ref={escalateReturn}
                type="button"
                variant="secondary"
                size="sm"
                disabled={!selectedId}
                aria-disabled={escalated || undefined}
                className={escalated ? "pointer-events-none opacity-50" : undefined}
                onClick={() => {
                  if (escalated) return;
                  setEscalateOpen(true);
                }}
              >
                Escalate
              </Button>
            </span>
            {escalated ? <StatusBadge tone="success">Escalated</StatusBadge> : null}
            <ThemeToggle />
          </div>
        </header>
        <Thread
          agentName={persona?.agentName ?? ""}
          companyName={persona?.companyName ?? ""}
          greeting={persona?.greeting ?? ""}
          prompts={persona?.suggestedPrompts ?? []}
          messages={stream.messages}
          loading={messagesLoading}
          streaming={stream.streaming}
          notice={notice}
          showEmpty={showEmpty}
          conversationKey={selectedId ?? "new"}
          hasMore={messageHasMore}
          olderError={olderError}
          onPrompt={send}
          onLoadOlder={loadOlder}
          onRetry={canRetry ? () => stream.retry(selectedId) : undefined}
        />
        <div className="mx-auto w-full max-w-[760px] shrink-0 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Composer
            streaming={stream.streaming}
            canSend={Boolean(modelId)}
            onSend={send}
            onStop={stream.stop}
          />
        </div>
      </div>
      <DeleteDialog
        open={deleteId !== null}
        pending={deleting}
        returnFocus={deleteReturn}
        onOpenChange={(open) => {
          if (!open) setDeleteId(null);
        }}
        onConfirm={confirmDelete}
      />
      <EscalateDialog
        open={escalateOpen}
        returnFocus={escalateReturn}
        onOpenChange={setEscalateOpen}
        onSubmit={escalate}
      />
    </div>
  );
}
