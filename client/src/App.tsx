import { DesignPage } from "@/pages/DesignPage";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Toaster } from "@/components/ui/sonner";

export default function App() {
  const showDesign = import.meta.env.DEV && window.location.pathname === "/dev/design";

  return (
    <ThemeProvider>
      {showDesign ? <DesignPage /> : null}
      <Toaster />
    </ThemeProvider>
  );
}
