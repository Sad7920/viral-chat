import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const tones = {
  success: { wrap: "bg-success-tint", dot: "bg-success" },
  warning: { wrap: "bg-warning-tint", dot: "bg-warning" },
  error: { wrap: "bg-error-tint", dot: "bg-destructive" },
  neutral: { wrap: "bg-muted text-muted-foreground", dot: "bg-subtle" },
} as const;

type Props = { tone?: keyof typeof tones; pulse?: boolean; children: ReactNode };

export function StatusBadge({ tone = "neutral", pulse = false, children }: Props) {
  const t = tones[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium text-foreground",
        t.wrap,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full",
          t.dot,
          pulse && "animate-pulse motion-reduce:animate-none",
        )}
      />
      {children}
    </span>
  );
}
