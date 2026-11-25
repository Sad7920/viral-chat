import { CircleAlert } from "lucide-react";
import { useLayoutEffect, useRef } from "react";
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
  onPrompt: (text: string) => void;
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

function StreamError({ message }: { message: string }) {
  return (
    <div role="alert" className="flex items-center gap-3 rounded-card bg-error-tint p-3 text-sm">
      <CircleAlert aria-hidden className="size-4 shrink-0 text-destructive" />
      <p className="text-foreground">{message}</p>
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
  onPrompt,
}: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const pin = useRef(true);
  const oldestId = messages[0]?.id ?? "";
  const seen = useRef(oldestId);
  const lastId = messages[messages.length - 1]?.id;

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (seen.current !== oldestId) {
      seen.current = oldestId;
      pin.current = true;
    }
    if (pin.current) el.scrollTop = el.scrollHeight;
  }, [messages, notice, loading, oldestId]);

  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    pin.current = el.scrollHeight - el.scrollTop - el.clientHeight <= STICKY_GAP;
  }

  return (
    <div
      ref={scroller}
      role="log"
      aria-label="Messages"
      aria-busy={loading || streaming}
      onScroll={onScroll}
      className="min-h-0 flex-1 overflow-y-auto"
    >
      <div
        className={
          showEmpty
            ? "mx-auto flex min-h-full w-full max-w-[760px] flex-col justify-center px-4 py-6"
            : "mx-auto flex w-full max-w-[760px] flex-col gap-6 px-4 py-6"
        }
      >
        {loading ? <MessageSkeleton /> : null}
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
                pending={streaming && message.id === lastId}
                showCopy={!message.incomplete}
              />
            ),
          )}
        {notice?.tone === "warning" ? <Callout title={notice.message} /> : null}
        {notice?.tone === "error" ? <StreamError message={notice.message} /> : null}
      </div>
    </div>
  );
}
