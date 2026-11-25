import type { CSSProperties } from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import { useTheme } from "@/components/ThemeProvider";

function Toaster({ ...props }: ToasterProps) {
  const { theme } = useTheme();

  return (
    <Sonner
      className="toaster group font-sans text-sm"
      toastOptions={{ classNames: { toast: "font-sans text-sm! shadow-popover!" } }}
      {...props}
      theme={theme}
      position="top-center"
      duration={3000}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "16px",
        } as CSSProperties
      }
    />
  );
}

export { Toaster };
