import { createContext, useContext, useEffect, useState } from "react";
import type { UserRecord } from "../shared/types";

type AuthContextType = {
  token: string | null;
  user: UserRecord | null;
  login: (token: string, user: UserRecord) => void;
  logout: () => void;
  isLoading: boolean;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize from localStorage on mount
  useEffect(() => {
    const savedToken = localStorage.getItem("authToken");
    const savedUser = localStorage.getItem("user");

    if (savedToken && savedUser) {
      try {
        const parsed = JSON.parse(savedUser);
        if (parsed && typeof parsed.id === "string" && typeof parsed.email === "string") {
          setToken(savedToken);
          setUser(parsed as UserRecord);
        } else {
          localStorage.removeItem("authToken");
          localStorage.removeItem("user");
        }
      } catch {
        localStorage.removeItem("authToken");
        localStorage.removeItem("user");
      }
    }

    setIsLoading(false);
  }, []);

  function login(newToken: string, newUser: UserRecord) {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem("authToken", newToken);
    localStorage.setItem("user", JSON.stringify(newUser));
  }

  function logout() {
    setToken(null);
    setUser(null);
    localStorage.removeItem("authToken");
    localStorage.removeItem("user");
  }

  return (
    <AuthContext.Provider value={{ token, user, login, logout, isLoading }}>
      {isLoading ? null : children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
