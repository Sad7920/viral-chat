import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { useAuth, AuthProvider } from "@/auth";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Toaster } from "@/components/ui/sonner";
import { Chat } from "@/pages/Chat";
import { Login } from "@/pages/Login";
import { Signup } from "@/pages/Signup";

function Gate({ children, mode }: { children: ReactNode; mode: "user" | "guest" }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (mode === "user" && !user) return <Navigate to="/login" replace />;
  if (mode === "guest" && user) return <Navigate to="/" replace />;
  return children;
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
              element={
                <Gate mode="user">
                  <Chat />
                </Gate>
              }
            >
              <Route path="/" element={null} />
              <Route path="/c/:conversationId" element={null} />
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
      <Toaster />
    </ThemeProvider>
  );
}
