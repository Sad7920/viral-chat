# Design system: Lumen Ledger support chat

Adapted from the Retrivo design kit and trimmed to what this app uses. This file is the single source of truth for all UI. Read it before changing any `.tsx` or `.css` file. Behavior, API and data live in `docs/SPEC.md`. If something you need is missing, stop and propose a token or component. Do not invent one.

Stack: Vite + React + TypeScript (strict), Tailwind CSS v4 (Vite plugin, no config file), shadcn/ui in TypeScript mode (`"tsx": true`). This is NOT Next.js: no `next/font`, no `next-themes`, no `"use client"`.

## 1. Mood

Calm, trustworthy, compact. A support desk, not a toy. Mostly neutral, one blue, status colors only for status. No gradients, no decoration, no illustrations, no background changer. The theme (light or dark) is the only appearance setting.

## 2. Tokens

Copy this block exactly into `client/src/index.css`. It is the only stylesheet in the project.

```css
@import "tailwindcss";
@import "tw-animate-css";
@custom-variant dark (&:is(.dark *));

:root {
  /* shadcn semantic tokens */
  --background: #F8FAFC;
  --foreground: #0F172A;
  --card: #FFFFFF;
  --card-foreground: #0F172A;
  --popover: #FFFFFF;
  --popover-foreground: #0F172A;
  --primary: #2563EB;
  --primary-foreground: #FFFFFF;
  --muted: #F1F5F9;
  --muted-foreground: #475569;
  --accent: #F1F5F9;
  --accent-foreground: #0F172A;
  --destructive: #DC2626;
  --border: #E2E8F0;
  --input: #CBD5E1;
  --ring: #2563EB;
  --radius: 1rem;
  --sidebar: #F1F5F9;
  --sidebar-foreground: #0F172A;
  --sidebar-accent: #EFF6FF;
  --sidebar-accent-foreground: #1D4ED8;
  --sidebar-border: #E2E8F0;

  /* extended tokens */
  --border-strong: #CBD5E1;
  --subtle: #64748B; /* placeholders, captions, dates */
  --primary-hover: #1D4ED8;
  --link: #1D4ED8;
  --destructive-solid: #DC2626; /* fill for destructive buttons, white text 4.8:1 in both themes */
  --success: #16A34A;
  --success-tint: #F0FDF4;
  --warning: #F59E0B;
  --warning-tint: #FFFBEB;
  --warning-border: #FCD34D;
  --error-tint: #FEF2F2;
  --veil: rgba(15, 23, 42, 0.05); /* hover wash */
  --bubble-user: #0F172A;
  --bubble-user-foreground: #F8FAFC;
  --elevation-card: 0 1px 2px rgba(15, 23, 42, 0.06);
  --elevation-popover: 0 8px 24px rgba(15, 23, 42, 0.12);
}

.dark {
  --background: #0B1220;
  --foreground: #E2E8F0;
  --card: #111A2E;
  --card-foreground: #E2E8F0;
  --popover: #162036;
  --popover-foreground: #E2E8F0;
  --primary: #2563EB; /* fills stay #2563EB: white text 5.2:1 */
  --primary-foreground: #FFFFFF;
  --muted: #162036;
  --muted-foreground: #94A3B8;
  --accent: #1E293B;
  --accent-foreground: #E2E8F0;
  --destructive: #EF4444;
  --border: #1E293B;
  --input: #334155;
  --ring: #60A5FA;
  --sidebar: #0E1627;
  --sidebar-foreground: #E2E8F0;
  --sidebar-accent: #172554;
  --sidebar-accent-foreground: #93C5FD;
  --sidebar-border: #1E293B;

  --border-strong: #334155;
  --subtle: #8493A8;
  --primary-hover: #1D4ED8;
  --link: #60A5FA;
  --destructive-solid: #DC2626;
  --success: #22C55E;
  --success-tint: #0F2A1B;
  --warning: #FBBF24;
  --warning-tint: #2A2310;
  --warning-border: #5A4614;
  --error-tint: #2D1517;
  --veil: rgba(226, 232, 240, 0.06);
  --bubble-user: #1E293B;
  --bubble-user-foreground: #E2E8F0;
  /* dark mode uses borders instead of shadows */
  --elevation-card: none;
  --elevation-popover: none;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-border-strong: var(--border-strong);
  --color-subtle: var(--subtle);
  --color-primary-hover: var(--primary-hover);
  --color-link: var(--link);
  --color-destructive-solid: var(--destructive-solid);
  --color-success: var(--success);
  --color-success-tint: var(--success-tint);
  --color-warning: var(--warning);
  --color-warning-tint: var(--warning-tint);
  --color-warning-border: var(--warning-border);
  --color-error-tint: var(--error-tint);
  --color-veil: var(--veil);
  --color-bubble-user: var(--bubble-user);
  --color-bubble-user-foreground: var(--bubble-user-foreground);

  /* radii: buttons, chips, badges and the send/stop button use rounded-full */
  --radius-row: 12px;
  --radius-input: 12px;
  --radius-card: 16px;
  --radius-dialog: 20px;
  --radius-bubble: 20px;

  --shadow-card: var(--elevation-card);
  --shadow-popover: var(--elevation-popover);

  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
  --font-serif: "Source Serif 4", ui-serif, Georgia, serif;
  --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, monospace;
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground font-sans antialiased;
    font-size: 16px;
    line-height: 1.6;
  }
}

/* Display headings: serif, weight 300, 22px and up only */
@utility font-display {
  font-family: var(--font-serif);
  font-weight: 300;
  letter-spacing: -0.02em;
  line-height: 1.15;
}

/* Small uppercase technical label */
@utility label-mono {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

```

Differences from the Retrivo kit, on purpose:

- Removed: citation and chip tokens (`--highlight`, `--chip-text`, `--primary-tint`, `--primary-border`), tooltip tokens, `--secondary*`, `--sidebar-primary*`, `--sidebar-ring`.
- Added: `--destructive-solid` (white text on the dark-mode `--destructive` fails 4.5:1).
- Fonts are loaded with Fontsource, so the font variables hold plain family names.

## 3. Fonts

Self-hosted with Fontsource and imported in `main.tsx`: `@fontsource/inter` (400, 500), `@fontsource/source-serif-4` (300), `@fontsource/jetbrains-mono` (400, 500).

- Inter 400 and 500 only. Never bold or semibold. Message reading text 16px/1.6. UI text 14px/1.45.
- Source Serif 4 at weight 300 only, via `font-display`, only for headings of 22px and up (empty-state agent name, auth page titles).
- JetBrains Mono for code and `label-mono` section labels (for example "Recent" in the sidebar).

## 4. Theme

- Two themes, light and dark, switched by the `dark` class on `<html>`. No "system" button: the first visit follows `prefers-color-scheme`, and once the user clicks the toggle their choice is stored in `localStorage` under `lumen-theme`.
- A small inline script in `index.html` applies the class before first paint so there is no flash. Wrap storage access in try/catch.
- `ThemeProvider.tsx` exposes `useTheme(): { theme: "light" | "dark"; toggleTheme: () => void }`. Until the user chooses, it also follows live changes to the system preference. About 30 lines. Anything that needs the theme (the Sonner toaster) uses this hook.
- `ThemeToggle.tsx`: a ghost icon button (`size="icon"`) with `Sun` in dark mode and `Moon` in light mode, and `aria-label="Switch to light theme"` or `"Switch to dark theme"` to match.

## 5. Components

### Imported from shadcn (only these)

`button`, `input`, `textarea`, `label`, `card`, `dialog`, `sheet`, `sonner`, `skeleton`. Do not add tooltip, tabs, dropdown-menu, badge, select, sidebar or anything else without asking. Restyle with class changes only; keep the generated component structure.

| Component | Spec                                                                                                                                                              |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Button    | Variants below. Pill shaped, no shadows. Exactly one filled primary button per view: Send (or Stop while streaming) in the chat, the submit button on auth pages. |
| Input     | `h-9 w-full rounded-input border border-input bg-card px-3 text-sm placeholder:text-subtle` plus the focus ring                                                   |
| Textarea  | Same recipe as Input, `min-h-20 py-2`, `resize-none`                                                                                                              |
| Label     | `text-sm font-medium`                                                                                                                                             |
| Card      | `rounded-card border bg-card text-card-foreground shadow-card`, `p-6` for auth                                                                                    |
| Dialog    | Content `rounded-dialog border bg-popover text-popover-foreground shadow-popover p-6`. Overlay `bg-background/80 backdrop-blur-sm`. Buttons are pills.            |
| Sheet     | Left side, `w-[260px] bg-sidebar border-r border-sidebar-border`. Same overlay as Dialog. Used for the mobile sidebar.                                            |
| Skeleton  | `animate-pulse rounded-row bg-muted motion-reduce:animate-none`                                                                                                   |
| Sonner    | Details below                                                                                                                                                     |

Button variants (replace the generated `cva` block with exactly this):

```ts
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary-hover",
        secondary: "border border-border-strong bg-transparent text-foreground hover:bg-veil",
        ghost: "text-foreground hover:bg-veil",
        destructive: "bg-destructive-solid text-white hover:opacity-90",
        link: "rounded-none text-link underline-offset-4 hover:underline",
      },
      size: { default: "h-9 px-4", sm: "h-8 px-3", icon: "size-9" },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

```

Sonner (`components/ui/sonner.tsx`): shadcn's template imports `next-themes`. Rewrite it to read `theme` from our `useTheme()` and uninstall `next-themes` if it was installed. Set `position="top-center"` (it must not cover the composer), `duration={3000}`, and pass sonner's CSS variables through `style`: `--normal-bg: var(--popover)`, `--normal-text: var(--popover-foreground)`, `--normal-border: var(--border)`, `--border-radius: 16px`. Toasts use `font-sans text-sm`. Mount one `<Toaster />` in `App.tsx`.

Toast rules: toasts are for short, non-blocking feedback only ("Copied", a failed delete, a failed escalation). Stream errors, failed pages and validation errors are always inline, never toasts. Never more than one line of text.

### Hand-written (PascalCase `.tsx` files in `src/components/`)

StatusBadge: always dot plus text, never color alone.

```tsx
import { cn } from "@/lib/utils";

const tones = {
  success: { wrap: "bg-success-tint", dot: "bg-success" },
  warning: { wrap: "bg-warning-tint", dot: "bg-warning" },
  error: { wrap: "bg-error-tint", dot: "bg-destructive" },
  neutral: { wrap: "bg-muted text-muted-foreground", dot: "bg-subtle" },
} as const;

type Props = { tone?: keyof typeof tones; pulse?: boolean; children: React.ReactNode };

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
        className={cn("size-1.5 rounded-full", t.dot, pulse && "animate-pulse motion-reduce:animate-none")}
      />
      {children}
    </span>
  );
}

```

Callout: the amber "this is not an error" state (rate limited, needs attention). Never red.

```tsx
import { CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = { title: string; children?: React.ReactNode; className?: string };

export function Callout({ title, children, className }: Props) {
  return (
    <div
      role="status"
      className={cn("flex gap-3 rounded-card border border-warning-border bg-warning-tint p-4", className)}
    >
      <CircleAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-warning" />
      <div className="space-y-1">
        <p className="text-base font-medium leading-snug">{title}</p>
        {children && <div className="text-sm text-muted-foreground">{children}</div>}
      </div>
    </div>
  );
}

```

Error row (stream or network failure): `flex items-center gap-3 rounded-card bg-error-tint p-3 text-sm`, an alert icon in `text-destructive`, the message in `text-foreground`, and a secondary `sm` Retry button. Uses `role="alert"`.

Stopped row (the user pressed Stop before any text arrived): `flex items-center gap-3 text-sm text-muted-foreground` with the text "Stopped before a reply" and a secondary `sm` Retry button. Not red, not amber.

UserMessage and AssistantMessage (`Message.tsx`):

- User: right aligned, `max-w-[80%] rounded-bubble bg-bubble-user px-4 py-2.5 text-bubble-user-foreground`. In dark mode add `border border-border-strong` so the bubble stays visible on the background.
- Assistant: no bubble, full column width, `text-base leading-relaxed`, with the agent name above in `text-sm text-muted-foreground`.
- Under a finished assistant message: a ghost `icon` Copy button (`Copy` icon, switching to `Check` for 1.5s, `aria-label="Copy message"`). If the message is incomplete: the warning StatusBadge "Incomplete" and a secondary `sm` Retry button.

Markdown inside the assistant message is styled by mapping elements in react-markdown's `components` prop to Tailwind classes. No typography plugin, no extra CSS.

- `p` `my-2 first:mt-0 last:mb-0`; `ul`/`ol` `my-2 ml-5 list-disc` / `list-decimal`; `li` `my-1`
- `a` `text-link underline underline-offset-4` with `target="_blank" rel="noopener noreferrer"`
- inline `code` `rounded-sm bg-muted px-1 py-0.5 font-mono text-[0.9em]`
- `pre` `my-3 overflow-x-auto rounded-row border bg-card p-3 font-mono text-sm`
- `h1` to `h3` render at `text-base font-medium`
- Raw HTML stays disabled (do not add rehype-raw).

Composer: one card holding an auto-growing textarea and one circular button.

- Container: `rounded-card border bg-card p-2 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background`
- Textarea: `w-full resize-none bg-transparent px-2 py-1.5 text-base outline-none placeholder:text-subtle`, grows to about 6 lines (`max-h-36`), then scrolls
- Button, bottom right, 36px circle (`<Button size="icon">`), the only filled blue control on screen:
  - idle: `ArrowUp` icon, `aria-label="Send"`, disabled when the textarea is empty
  - while a reply streams: the same button becomes Stop: `Square` icon with `fill-current`, `aria-label="Stop generating"`, never disabled

Model select: native `<select>` (no library). `h-8 appearance-none rounded-full border border-border-strong bg-transparent pl-3 pr-8 text-sm text-foreground`, a `ChevronDown` icon absolutely positioned on the right (`pointer-events-none text-muted-foreground`), plus the focus ring. No visible "Model" label; use `aria-label="Model"`.

### Not used from the Retrivo kit (do not add)

Chip, Tabs, Tooltip, DropdownMenu, Badge, the marketing nav, serif hero, the right-hand panel.

## 6. Layout

- App shell: `h-dvh` flex row. Sidebar 260px (`bg-sidebar border-r border-sidebar-border`), main column fills the rest and uses `bg-background`.
- Under `md` (768px) the sidebar is hidden and opens as a Sheet from a ghost icon button (`Menu` icon, `aria-label="Open conversations"`) in the top bar.
- Top bar: `h-14 border-b bg-background px-4`, 8px gaps. Left: company name (`text-base font-medium`) with the agent name beside it in `text-sm text-muted-foreground`, then the model select. Right: Escalate (secondary, sm), the "Escalated" success StatusBadge when set, and the ThemeToggle. On narrow screens the agent name hides before anything else; the model select shrinks and truncates.
- Thread region: the scrolling area between the top bar and the composer.
- Content column: `mx-auto w-full max-w-[760px] px-4`, `gap-6` between turns.
- Composer docked at the bottom of the main column, inside the same 760px column, `pb-4`, honoring `env(safe-area-inset-bottom)`.
- Density: compact. 8px gaps, 16px card padding. 4px base unit.

## 7. Screens

Sidebar:

- Header: company name (`text-base font-medium`) with `label-mono` "Support" under it. Full-width secondary pill button "New chat" with a `Plus` icon.
- `label-mono` "Recent" above the list.
- Row: `rounded-row px-3 py-2`, title `text-sm` truncated, date `text-xs text-subtle`. Hover `bg-veil`. Active `bg-sidebar-accent text-sidebar-accent-foreground`.
- Delete icon button (ghost, icon, `Trash2`, `aria-label="Delete conversation"`) appears on row hover and on focus-within; always visible at low opacity on touch devices (`[@media(hover:none)]:opacity-100`).
- "Load more" ghost sm button at the end of the list.
- Loading: 6 Skeleton rows (`h-12`) on the first load.
- Footer: signed-in email (`text-sm text-muted-foreground`, truncated) and a ghost "Log out" button.

Empty state (centered in the thread):

- Agent name as `font-display text-4xl text-foreground`, company name as `label-mono text-muted-foreground`, greeting as `text-base text-muted-foreground` (max width about 560px).
- Three suggested prompts as secondary pill buttons in a wrapping row, `text-sm`.

Thread loading: while a conversation's first page loads, show alternating Skeleton blocks (a right-aligned `h-10 w-2/3` user block, then a left-aligned `h-20 w-full` assistant block, three pairs).

Auth pages: centered `Card` (`max-w-sm`), `font-display text-3xl` title, Label plus Input fields, full-width primary button, link-variant button to the other page. Errors in `text-sm text-destructive` with `role="alert"`.

Dialogs (Delete conversation, Escalate): title `text-lg font-medium`, description `text-sm text-muted-foreground`, buttons right aligned with the secondary Cancel first. Delete uses the `destructive` variant for its confirm button. Escalate has a Textarea, a live `n/500` counter in `text-xs text-subtle`, and the primary confirm button.

## 8. Interaction and accessibility

- Hover is `bg-veil` on rows and ghost controls. Focus is a 2px primary ring with 2px offset on every interactive element, always visible with `focus-visible`.
- Blue appears only for: the one primary action per view, the active sidebar row, links, and the focus ring.
- Every icon-only button has an `aria-label`. Dialogs and the Sheet trap focus and restore it on close (Radix does this; do not break it).
- The thread has `role="log"`, and `aria-busy` while streaming.
- Text contrast is at least 4.5:1. `--subtle` is the lightest allowed text color. Do not lighten it.
- Keyboard: Enter sends, Shift+Enter inserts a newline (ignore Enter during IME composition), Escape closes dialogs, everything reachable by Tab in a sensible order.
- Respect `prefers-reduced-motion`. Transitions are `transition-colors` only. No decorative animation.

## 9. Don't

- No pure `#000`. No `bg-black` or `text-black`. No gradients. No new colors, fonts or radii; propose a token instead.
- No hard-coded hex values or arbitrary color values in components. No raw palette classes (`slate-100`, `gray-500`).
- No font weights above 500. No serif outside `font-display` headings of 22px and up.
- No text transparency for body text. No shadows on buttons.
- No inline `style` for colors, except the Sonner CSS-variable props. No second stylesheet.
- Status is never color alone: badge dot plus text.
- No toasts for stream errors or failed pages.