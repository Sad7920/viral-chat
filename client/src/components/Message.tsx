import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import Markdown from "react-markdown";
import { toast } from "sonner";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";

const focus =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(id);
  }, [copied]);

  function onCopy() {
    void navigator.clipboard.writeText(text).then(
      () => {
        setCopied(true);
        toast("Copied");
      },
      () => undefined,
    );
  }

  return (
    <Button type="button" variant="ghost" size="icon" aria-label="Copy message" onClick={onCopy}>
      {copied ? <Check /> : <Copy />}
    </Button>
  );
}

function AssistantBody({ content }: { content: string }) {
  return (
    <Markdown
      components={{
        p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
        ul: ({ children }) => <ul className="my-2 ml-5 list-disc">{children}</ul>,
        ol: ({ children }) => <ol className="my-2 ml-5 list-decimal">{children}</ol>,
        li: ({ children }) => <li className="my-1">{children}</li>,
        a: ({ href, children }) => (
          <a
            href={href}
            className={`text-link underline underline-offset-4 ${focus}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {children}
          </a>
        ),
        code: ({ className, children }) => {
          const block = Boolean(className) || String(children).endsWith("\n");
          return block ? (
            <code className={className}>{children}</code>
          ) : (
            <code className="rounded-sm bg-muted px-1 py-0.5 font-mono text-[0.9em]">
              {children}
            </code>
          );
        },
        pre: ({ children }) => (
          <pre className="my-3 overflow-x-auto rounded-row border bg-card p-3 font-mono text-sm">
            {children}
          </pre>
        ),
        h1: ({ children }) => <h1 className="text-base font-medium">{children}</h1>,
        h2: ({ children }) => <h2 className="text-base font-medium">{children}</h2>,
        h3: ({ children }) => <h3 className="text-base font-medium">{children}</h3>,
      }}
    >
      {content}
    </Markdown>
  );
}

export function UserMessage({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[80%] rounded-bubble bg-bubble-user px-4 py-2.5 break-words whitespace-pre-wrap text-bubble-user-foreground dark:border dark:border-border-strong">
        {content}
      </p>
    </div>
  );
}

export function AssistantMessage({
  name,
  content,
  incomplete = false,
  pending = false,
  showCopy = true,
}: {
  name: string;
  content: string;
  incomplete?: boolean;
  pending?: boolean;
  showCopy?: boolean;
}) {
  const action = pending ? null : incomplete ? (
    <StatusBadge tone="warning">Incomplete</StatusBadge>
  ) : showCopy && content ? (
    <CopyButton text={content} />
  ) : null;

  return (
    <article className="min-w-0 text-base leading-relaxed">
      <p className="text-sm text-muted-foreground">{name}</p>
      {content ? <AssistantBody content={content} /> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </article>
  );
}
