import { useState } from "react";
import { LogOut } from "lucide-react";
import { useAuth } from "./AuthContext";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { App as Dashboard } from "./App";

type AuthPage = "login" | "register";

export function RootApp() {
  const { token, user, login, logout } = useAuth();
  const [authPage, setAuthPage] = useState<AuthPage>("login");

  // Loading state handled by AuthContext
  if (!token || !user) {
    return (
      <>
        {authPage === "login" ? (
          <Login onLoginSuccess={login} onSwitchToRegister={() => setAuthPage("register")} />
        ) : (
          <Register onRegisterSuccess={login} onSwitchToLogin={() => setAuthPage("login")} />
        )}
      </>
    );
  }

  // Authenticated - show dashboard
  return (
    <div className="app-container">
      <Dashboard />
      <div className="user-menu-corner">
        <div className="user-info">
          <span className="user-name">{user.name}</span>
          <span className="user-email">{user.email}</span>
        </div>
        <button onClick={logout} className="logout-button" title="Logout">
          <LogOut size={18} />
        </button>
      </div>
    </div>
  );
}
