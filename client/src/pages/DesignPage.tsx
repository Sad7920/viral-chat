import { Moon } from "lucide-react";
import { toast } from "sonner";
import { Callout } from "@/components/Callout";
import { AssistantMessage, UserMessage } from "@/components/Message";
import { StatusBadge } from "@/components/StatusBadge";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

const swatches = [
  ["background", "bg-background"],
  ["foreground", "bg-foreground"],
  ["card", "bg-card"],
  ["card-foreground", "bg-card-foreground"],
  ["popover", "bg-popover"],
  ["popover-foreground", "bg-popover-foreground"],
  ["primary", "bg-primary"],
  ["primary-foreground", "bg-primary-foreground"],
  ["muted", "bg-muted"],
  ["muted-foreground", "bg-muted-foreground"],
  ["accent", "bg-accent"],
  ["accent-foreground", "bg-accent-foreground"],
  ["destructive", "bg-destructive"],
  ["border", "bg-border"],
  ["input", "bg-input"],
  ["ring", "bg-ring"],
  ["sidebar", "bg-sidebar"],
  ["sidebar-foreground", "bg-sidebar-foreground"],
  ["sidebar-accent", "bg-sidebar-accent"],
  ["sidebar-accent-foreground", "bg-sidebar-accent-foreground"],
  ["sidebar-border", "bg-sidebar-border"],
  ["border-strong", "bg-border-strong"],
  ["subtle", "bg-subtle"],
  ["primary-hover", "bg-primary-hover"],
  ["link", "bg-link"],
  ["destructive-solid", "bg-destructive-solid"],
  ["success", "bg-success"],
  ["success-tint", "bg-success-tint"],
  ["warning", "bg-warning"],
  ["warning-tint", "bg-warning-tint"],
  ["warning-border", "bg-warning-border"],
  ["error-tint", "bg-error-tint"],
  ["veil", "bg-veil"],
  ["bubble-user", "bg-bubble-user"],
  ["bubble-user-foreground", "bg-bubble-user-foreground"],
] as const;

const variants = ["default", "secondary", "ghost", "destructive", "link"] as const;
const sizes = ["default", "sm", "icon"] as const;

const assistantSample = `See the [status page](https://example.com) before you continue.

- Open the message
- Choose a new password
- Sign in again

\`\`\`
const ready = true;
\`\`\`
`;

export function DesignPage() {
  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8 px-4 py-8">
        <header className="flex items-center justify-between gap-3">
          <h1 className="font-display text-2xl text-foreground">Design</h1>
          <ThemeToggle />
        </header>

        <section className="flex flex-col gap-3">
          <h2 className="label-mono text-muted-foreground">Tokens</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {swatches.map(([name, className]) => (
              <div key={name} className="flex items-center gap-2">
                <div className={`size-8 shrink-0 rounded-row border border-border ${className}`} />
                <span className="text-sm">{name}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="size-12 rounded-row border bg-card shadow-card" />
            <div className="size-12 rounded-input border bg-card shadow-card" />
            <div className="size-12 rounded-card border bg-card shadow-card" />
            <div className="size-12 rounded-dialog border bg-popover shadow-popover" />
            <div className="size-12 rounded-bubble border bg-bubble-user" />
            <div className="size-12 rounded-full border bg-card shadow-card" />
          </div>
          <p className="font-sans text-sm">Inter for interface text.</p>
          <p className="font-display text-2xl">Source Serif for display.</p>
          <p className="font-mono text-sm">JetBrains Mono for code.</p>
          <p className="label-mono text-muted-foreground">Recent</p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="label-mono text-muted-foreground">Buttons</h2>
          <div className="flex flex-wrap items-center gap-2">
            {variants.flatMap((variant) =>
              sizes.map((size) => (
                <Button
                  key={`${variant}-${size}`}
                  type="button"
                  variant={variant}
                  size={size}
                  aria-label={size === "icon" ? `${variant} icon` : undefined}
                >
                  {size === "icon" ? <Moon /> : variant}
                </Button>
              )),
            )}
          </div>
          <Button type="button" variant="secondary" onClick={() => toast("Copied")}>
            Show copied toast
          </Button>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="label-mono text-muted-foreground">Fields</h2>
          <div className="flex flex-col gap-2">
            <Label htmlFor="sample-email">Email</Label>
            <Input id="sample-email" placeholder="you@example.com" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="sample-note">Note</Label>
            <Textarea id="sample-note" placeholder="Add a note" />
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="label-mono text-muted-foreground">Card</h2>
          <Card className="p-6">
            <CardHeader>
              <CardTitle>Sign in</CardTitle>
              <CardDescription>Auth cards use the card padding.</CardDescription>
            </CardHeader>
            <CardContent>
              <Label htmlFor="card-email">Email</Label>
              <Input id="card-email" placeholder="you@example.com" />
            </CardContent>
          </Card>
        </section>

        <section className="flex flex-wrap gap-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button type="button" variant="secondary">
                Open dialog
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete conversation</DialogTitle>
                <DialogDescription>This removes the conversation for good.</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button type="button" variant="secondary" size="sm">
                  Cancel
                </Button>
                <Button type="button" variant="destructive" size="sm">
                  Delete
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Sheet>
            <SheetTrigger asChild>
              <Button type="button" variant="secondary">
                Open sheet
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Conversations</SheetTitle>
                <SheetDescription>The mobile sidebar opens from the left.</SheetDescription>
              </SheetHeader>
            </SheetContent>
          </Sheet>
        </section>

        <section className="flex flex-wrap gap-2">
          <StatusBadge tone="success">Connected</StatusBadge>
          <StatusBadge tone="warning" pulse>
            Incomplete
          </StatusBadge>
          <StatusBadge tone="error">Failed</StatusBadge>
          <StatusBadge>Waiting</StatusBadge>
        </section>

        <Callout title="This is not an error">
          The account is rate limited. Try again shortly.
        </Callout>

        <section className="flex flex-col items-center gap-4 text-center">
          <h2 className="font-display text-4xl text-foreground">Sample agent</h2>
          <p className="label-mono text-muted-foreground">Sample company</p>
          <p className="max-w-[560px] text-base text-muted-foreground">
            Ask a question and the agent will answer here.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button type="button" variant="secondary">
              Where is my order?
            </Button>
            <Button type="button" variant="secondary">
              Update my email
            </Button>
            <Button type="button" variant="secondary">
              Talk to a person
            </Button>
          </div>
        </section>

        <section className="flex flex-col gap-6">
          <UserMessage content="How do I reset my password?" />
          <AssistantMessage name="Sample agent" content={assistantSample} />
          <AssistantMessage name="Sample agent" content="The reply stopped early." incomplete />
        </section>

        <section className="flex flex-col gap-4 sm:flex-row">
          <div className="flex w-full flex-col gap-2 border border-sidebar-border bg-sidebar p-3 sm:w-[260px]">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="flex flex-col gap-4">
                <Skeleton className="ml-auto h-10 w-2/3" />
                <Skeleton className="h-20 w-full" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
