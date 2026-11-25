import { useState, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { useAuth, AuthProvider } from "@/auth";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { Login } from "@/pages/Login";
import { Signup } from "@/pages/Signup";
import { DesignPage } from "@/pages/DesignPage";

function Gate({ children, mode }: { children: ReactNode; mode: "user" | "guest" }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (mode === "user" && !user) return <Navigate to="/login" replace />;
  if (mode === "guest" && user) return <Navigate to="/" replace />;
  return children;
}

function Home() {
  const { user, logout } = useAuth();
  const [error, setError] = useState("");
  if (!user) return null;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-4">
      <p className="text-sm text-muted-foreground">{user.email}</p>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        onClick={() => {
          setError("");
          void logout().catch(() => setError("Could not log out"));
        }}
      >
        Log out
      </Button>
    </main>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route
              path="/login"
              element={
                <Gate mode="guest">
                  <Login />
                </Gate>
              }
            />
            <Route
              path="/signup"
              element={
                <Gate mode="guest">
                  <Signup />
                </Gate>
              }
            />
            <Route
              path="/"
              element={
                <Gate mode="user">
                  <Home />
                </Gate>
              }
            />
            {import.meta.env.DEV ? <Route path="/dev/design" element={<DesignPage />} /> : null}
          </Routes>
        </AuthProvider>
      </BrowserRouter>
      <Toaster />
    </ThemeProvider>
  );
}
