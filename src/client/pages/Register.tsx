import { useState } from "react";
import { AlertCircle, Eye, EyeOff, ShieldCheck, UserPlus } from "lucide-react";
import type { RegisterRequest, UserRecord } from "../../shared/types";

type Props = {
  onRegisterSuccess: (token: string, user: UserRecord) => void;
  onSwitchToLogin: () => void;
};

export function Register({ onRegisterSuccess, onSwitchToLogin }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setLoading(true);

    try {
      const req: RegisterRequest = { email, password, name };
      const response = await fetch("/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Registration failed");
      }

      const data = await response.json();
      localStorage.setItem("authToken", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      onRegisterSuccess(data.token, data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
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
          <h1>Build resilient systems with predictive guardrails.</h1>
          <p>
            Create an account to spin up API keys, stress services, and demonstrate proactive failure prevention.
          </p>
          <div className="authFeatureGrid">
            <article>
              <ShieldCheck size={18} />
              <div>
                <strong>Secure access</strong>
                <span>JWT-protected operations for each user.</span>
              </div>
            </article>
            <article>
              <UserPlus size={18} />
              <div>
                <strong>Fast onboarding</strong>
                <span>Set up in minutes and test chaos flows instantly.</span>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="authFormPanel">
        <div className="authCard">
          <div className="authBadge success">
            <UserPlus size={22} />
          </div>

          <h2>Create Account</h2>
          <p className="authSubtext">Start your own workspace and generate user-scoped API keys.</p>

          {error && (
            <div className="authAlertError">
              <AlertCircle size={18} />
              <p>{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="authForm">
            <label>
              Name
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={loading}
                required
                placeholder="Your name"
              />
            </label>

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
                  placeholder="At least 8 characters"
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

            <label>
              Confirm Password
              <div className="passwordInputRow">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={loading}
                  required
                  placeholder="Repeat password"
                />
                <button
                  type="button"
                  className="passwordToggle"
                  onClick={() => setShowConfirmPassword((value) => !value)}
                  aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                >
                  {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>

            <button type="submit" disabled={loading} className="authSubmitButton success">
              {loading ? "Creating account..." : "Register"}
            </button>
          </form>

          <p className="authSwitchLine">
            Already have an account?
            <button onClick={onSwitchToLogin} type="button">
              Login
            </button>
          </p>

          <div className="authDemoCard">
            <p className="authDemoTitle">Try the demo account</p>
            <p>Email: demo@example.com</p>
            <p>Password: Password123!</p>
          </div>
        </div>
      </section>
    </main>
  );
}
