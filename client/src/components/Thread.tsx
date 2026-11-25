import { CircleAlert } from "lucide-react";
import { useEffect, useLayoutEffect, useRef } from "react";
import type { ChatMessage } from "@/api";
import { Callout } from "@/components/Callout";
import { AssistantMessage, UserMessage } from "@/components/Message";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { StreamNotice } from "@/hooks/useChatStream";

const STICKY_GAP = 80;

type Props = {
  agentName: string;
  companyName: string;
  greeting: string;
  prompts: string[];
  messages: ChatMessage[];
  loading: boolean;
  streaming: boolean;
  notice: StreamNotice | null;
  showEmpty: boolean;
  conversationKey: string;
  hasMore: boolean;
  olderError: string;
  onPrompt: (text: string) => void;
  onLoadOlder: () => void;
  onRetry?: () => void;
};

type Snapshot = {
  key: string;
  count: number;
  oldest: string;
  newest: string;
  top: number;
  height: number;
};

function MessageSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-6">
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="flex flex-col gap-6">
          <Skeleton className="ml-auto h-10 w-2/3" />
          <Skeleton className="h-20 w-full" />
        </div>
      ))}
    </div>
  );
}

function RetryButton({ onRetry }: { onRetry: () => void }) {
  return (
    <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
      Retry
    </Button>
  );
}

function StreamError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-center gap-3 rounded-card bg-error-tint p-3 text-sm">
      <CircleAlert aria-hidden className="size-4 shrink-0 text-destructive" />
      <p className="min-w-0 flex-1 text-foreground">{message}</p>
      {onRetry ? <RetryButton onRetry={onRetry} /> : null}
    </div>
  );
}

export function Thread({
  agentName,
  companyName,
  greeting,
  prompts,
  messages,
  loading,
  streaming,
  notice,
  showEmpty,
  conversationKey,
  hasMore,
  olderError,
  onPrompt,
  onLoadOlder,
  onRetry,
}: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const armed = useRef(false);
  const adjusting = useRef(false);
  const snapshot = useRef<Snapshot>({
    key: "",
    count: 0,
    oldest: "",
    newest: "",
    top: 0,
    height: 0,
  });
  const oldest = messages[0]?.id ?? "";
  const newest = messages.at(-1)?.id ?? "";

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (snapshot.current.key !== conversationKey) {
      armed.current = false;
      snapshot.current = {
        key: conversationKey,
        count: 0,
        oldest: "",
        newest: "",
        top: 0,
        height: el.scrollHeight,
      };
    }
    if (loading) return;
    const base = snapshot.current;
    const prepended =
      base.count > 0 &&
      messages.length > base.count &&
      newest === base.newest &&
      oldest !== base.oldest;

    adjusting.current = true;
    if (prepended) {
      // Rows were inserted above the viewport. Keep the same lines in view.
      el.scrollTop = base.top + (el.scrollHeight - base.height);
    } else if (base.count === 0) {
      el.scrollTop = el.scrollHeight;
      armed.current = true;
    } else if (stick.current) {
      el.scrollTop = el.scrollHeight;
    }
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight <= STICKY_GAP;
    adjusting.current = false;
    snapshot.current = {
      key: conversationKey,
      count: messages.length,
      oldest,
      newest,
      top: el.scrollTop,
      height: el.scrollHeight,
    };
  }, [messages, notice, olderError, loading, oldest, newest, conversationKey]);

  useEffect(() => {
    const el = scroller.current;
    const content = el?.firstElementChild;
    if (!el || !(content instanceof HTMLElement)) return;
    const observer = new ResizeObserver(() => {
      if (!stick.current || adjusting.current) return;
      adjusting.current = true;
      el.scrollTop = el.scrollHeight;
      adjusting.current = false;
      snapshot.current.top = el.scrollTop;
      snapshot.current.height = el.scrollHeight;
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [conversationKey]);

  useEffect(() => {
    const root = scroller.current;
    const target = sentinel.current;
    if (!root || !target || !hasMore || loading) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!armed.current || adjusting.current || olderError) return;
        if (root.scrollTop > 120) return;
        if (entries.some((entry) => entry.isIntersecting)) onLoadOlder();
      },
      { root },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, loading, conversationKey, olderError, onLoadOlder]);

  function onScroll() {
    if (adjusting.current) return;
    const el = scroller.current;
    if (!el) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight <= STICKY_GAP;
    snapshot.current.top = el.scrollTop;
  }

  return (
    <div
      ref={scroller}
      role="log"
      aria-label="Messages"
      aria-busy={loading || streaming}
      onScroll={onScroll}
      className="min-h-0 flex-1 overflow-y-auto [overflow-anchor:none]"
    >
      <div
        className={
          showEmpty
            ? "mx-auto flex min-h-full w-full max-w-[760px] flex-col justify-center px-4 py-6"
            : "mx-auto flex w-full max-w-[760px] flex-col gap-6 px-4 py-6"
        }
      >
        {hasMore ? <div ref={sentinel} aria-hidden className="h-px w-full shrink-0" /> : null}
        {loading ? <MessageSkeleton /> : null}
        {olderError ? <StreamError message={olderError} onRetry={onLoadOlder} /> : null}
        {showEmpty ? (
          <div className="flex flex-col items-center gap-4 text-center">
            <h1 className="font-display text-4xl text-foreground">{agentName}</h1>
            <p className="label-mono text-muted-foreground">{companyName}</p>
            <p className="max-w-[560px] text-base text-muted-foreground">{greeting}</p>
            <div className="flex flex-wrap justify-center gap-2">
              {prompts.map((prompt) => (
                <Button
                  key={prompt}
                  type="button"
                  variant="secondary"
                  className="text-sm"
                  disabled={streaming}
                  onClick={() => onPrompt(prompt)}
                >
                  {prompt}
                </Button>
              ))}
            </div>
          </div>
        ) : null}
        {!loading &&
          messages.map((message) =>
            message.role === "user" ? (
              <UserMessage key={message.id} content={message.content} />
            ) : (
              <AssistantMessage
                key={message.id}
                name={agentName}
                content={message.content}
                incomplete={message.incomplete}
                pending={streaming && message.id === newest}
                showCopy={!message.incomplete}
                onRetry={
                  onRetry && !streaming && message.incomplete && message.id === newest
                    ? onRetry
                    : undefined
                }
              />
            ),
          )}
        {notice?.tone === "warning" ? (
          <Callout title={notice.message}>
            {onRetry ? <RetryButton onRetry={onRetry} /> : null}
          </Callout>
        ) : null}
        {notice?.tone === "error" ? (
          <StreamError message={notice.message} onRetry={onRetry} />
        ) : null}
        {notice?.tone === "stopped" ? (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <p>Stopped before a reply</p>
            {onRetry ? <RetryButton onRetry={onRetry} /> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
