import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/ThemeProvider";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const toLight = theme === "dark";

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={toLight ? "Switch to light theme" : "Switch to dark theme"}
      onClick={toggleTheme}
    >
      {toLight ? <Sun /> : <Moon />}
    </Button>
  );
}
