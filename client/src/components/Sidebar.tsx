import { Plus } from "lucide-react";
import type { ConversationSummary } from "@/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const focus =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar";

type Props = {
  companyName: string;
  email: string;
  conversations: ConversationSummary[];
  activeId: string | null;
  loading: boolean;
  error: string;
  logoutError: string;
  menuOffset?: boolean;
  onNew: () => void;
  onSelect: (id: string) => void;
  onLogout: () => void;
};

function formatWhen(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

export function Sidebar({
  companyName,
  email,
  conversations,
  activeId,
  loading,
  error,
  logoutError,
  menuOffset = false,
  onNew,
  onSelect,
  onLogout,
}: Props) {
  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col bg-sidebar text-sidebar-foreground">
      <div className={cn("flex flex-col gap-3 p-3", menuOffset && "pr-12")}>
        <div>
          <p className="truncate text-base font-medium">{companyName}</p>
          <p className="label-mono text-muted-foreground">Support</p>
        </div>
        <Button type="button" variant="secondary" className="w-full" onClick={onNew}>
          <Plus />
          New chat
        </Button>
      </div>
      <p className="label-mono px-3 pb-2 text-muted-foreground">Recent</p>
      <div className="min-h-0 flex-1 overflow-y-auto px-2" aria-busy={loading}>
        {loading ? (
          <div aria-hidden className="flex flex-col gap-2">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
        ) : error ? (
          <p role="alert" className="px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : (
          <ul className="flex flex-col gap-1" aria-label="Recent">
            {conversations.map((item) => {
              const active = item.id === activeId;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    aria-current={active ? "true" : undefined}
                    onClick={() => onSelect(item.id)}
                    className={cn(
                      "w-full rounded-row px-3 py-2 text-left transition-colors hover:bg-veil",
                      focus,
                      active &&
                        "bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent",
                    )}
                  >
                    <span className="block truncate text-sm">{item.title}</span>
                    <span className="block text-xs text-subtle">{formatWhen(item.updatedAt)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="border-t border-sidebar-border p-3">
        <div className="flex flex-col items-start gap-1 md:flex-row md:items-center md:gap-2">
          <p className="w-full min-w-0 truncate text-sm text-muted-foreground md:flex-1">{email}</p>
          <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={onLogout}>
            Log out
          </Button>
        </div>
        {logoutError ? (
          <p role="alert" className="mt-1 text-sm text-destructive">
            {logoutError}
          </p>
        ) : null}
      </div>
    </div>
  );
}
