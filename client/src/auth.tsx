import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, type AuthUser } from "@/api";

type AuthValue = {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api<AuthUser>("/auth/me")
      .then((next) => {
        if (!cancelled) setUser(next);
      })
      .catch(() => {
        // A 401 from /auth/me means signed out.
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function login(email: string, password: string) {
    const next = await api<AuthUser>("/auth/login", {
      method: "POST",
      body: { email, password },
    });
    setUser(next);
  }

  async function signup(email: string, password: string) {
    const next = await api<AuthUser>("/auth/signup", {
      method: "POST",
      body: { email, password },
    });
    setUser(next);
  }

  async function logout() {
    await api<null>("/auth/logout", { method: "POST" });
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider");
  return value;
}
