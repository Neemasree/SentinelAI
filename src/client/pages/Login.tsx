import { useState } from "react";
import { AlertCircle, LogIn } from "lucide-react";
import type { LoginRequest } from "../../shared/types";

import type { UserRecord } from "../../shared/types";

type Props = {
  onLoginSuccess: (token: string, user: UserRecord) => void;
  onSwitchToRegister: () => void;
};

export function Login({ onLoginSuccess, onSwitchToRegister }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const req: LoginRequest = { email, password };
      const response = await fetch("http://127.0.0.1:4000/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Login failed");
      }

      const data = await response.json();
      localStorage.setItem("authToken", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      onLoginSuccess(data.token, data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-800 rounded-lg shadow-xl p-8 border border-slate-700">
        <div className="flex justify-center mb-8">
          <div className="bg-blue-600 p-3 rounded-lg">
            <LogIn size={32} className="text-white" />
          </div>
        </div>

        <h1 className="text-3xl font-bold text-center text-white mb-2">SentinelAI</h1>
        <p className="text-center text-slate-400 mb-8">Predictive Self-Healing API Gateway</p>

        {error && (
          <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 mb-6 flex gap-3">
            <AlertCircle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-red-500 text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              required
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 disabled:opacity-50"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              required
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 disabled:opacity-50"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-lg transition-colors"
          >
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-slate-700">
          <p className="text-center text-slate-400 text-sm">
            Don't have an account?{" "}
            <button
              onClick={onSwitchToRegister}
              className="text-blue-400 hover:text-blue-300 font-semibold"
            >
              Register
            </button>
          </p>
        </div>

        <div className="mt-6 bg-slate-700/50 rounded-lg p-4">
          <p className="text-xs text-slate-400 mb-2">Demo Credentials:</p>
          <p className="text-xs text-slate-300">Email: demo@example.com</p>
          <p className="text-xs text-slate-300">Password: Password123!</p>
        </div>
      </div>
    </div>
  );
}
