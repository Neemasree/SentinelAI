import { useState } from "react";
import { AlertCircle, Eye, EyeOff, LogIn, ShieldCheck } from "lucide-react";
import type { LoginRequest } from "../../shared/types";

import type { UserRecord } from "../../shared/types";

type Props = {
  onLoginSuccess: (token: string, user: UserRecord) => void;
  onSwitchToRegister: () => void;
};

export function Login({ onLoginSuccess, onSwitchToRegister }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const req: LoginRequest = { email, password };
      const response = await fetch("/auth/login", {
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
    <main className="authLayout">
      <section className="authHeroPanel">
        <div className="authGlow authGlowOne" />
        <div className="authGlow authGlowTwo" />
        <div className="authHeroContent">
          <p className="authEyebrow">SentinelAI Gateway</p>
          <h1>Predictive traffic defense built for real incidents.</h1>
          <p>
            Watch forecasts, circuit states, key-level limits, and incident explanations in one live command center.
          </p>
          <div className="authFeatureGrid">
            <article>
              <ShieldCheck size={18} />
              <div>
                <strong>Proactive limits</strong>
                <span>Rate controls tighten before saturation.</span>
              </div>
            </article>
            <article>
              <LogIn size={18} />
              <div>
                <strong>Operator clarity</strong>
                <span>Readable incident feed for fast decisions.</span>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="authFormPanel">
        <div className="authCard">
          <div className="authBadge">
            <LogIn size={22} />
          </div>

          <h2>Sign In</h2>
          <p className="authSubtext">Enter your operator credentials to access the dashboard.</p>

          {error && (
            <div className="authAlertError">
              <AlertCircle size={18} />
              <p>{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="authForm">
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                required
                placeholder="you@example.com"
              />
            </label>

            <label>
              Password
              <div className="passwordInputRow">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  required
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  className="passwordToggle"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>

            <button type="submit" disabled={loading} className="authSubmitButton">
              {loading ? "Signing in..." : "Login"}
            </button>
          </form>

          <p className="authSwitchLine">
            Need an account?
            <button onClick={onSwitchToRegister} type="button">
              Register
            </button>
          </p>

          <div className="authDemoCard">
            <p className="authDemoTitle">Demo Credentials</p>
            <p>Email: demo@example.com</p>
            <p>Password: Password123!</p>
          </div>
        </div>
      </section>
    </main>
  );
}
