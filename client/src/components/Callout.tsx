import { CircleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = { title: string; children?: ReactNode; className?: string };

export function Callout({ title, children, className }: Props) {
  return (
    <div
      role="status"
      className={cn(
        "flex gap-3 rounded-card border border-warning-border bg-warning-tint p-4",
        className,
      )}
    >
      <CircleAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-warning" />
      <div className="space-y-1">
        <p className="text-base font-medium leading-snug">{title}</p>
        {children && <div className="text-sm text-muted-foreground">{children}</div>}
      </div>
    </div>
  );
}
