import { useState } from "react";
import type { FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../api/client";

export function AuthPage({ mode }: { mode: "login" | "register" }) {
  const { user, login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isLogin = mode === "login";
  const from = (location.state as { from?: string } | null)?.from;
  if (user) return <Navigate to={from ?? `/studio/channel/${user.id}`} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await (isLogin ? login : register)(email, password);
      navigate(from ?? "/", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="card narrow">
      <h1>{isLogin ? "Sign in" : "Create account"}</h1>
      <form onSubmit={onSubmit}>
        <label>
          Email
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Password
          <input
            type="password"
            required
            minLength={isLogin ? 1 : 8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy}>
          {busy ? "Please wait…" : isLogin ? "Sign in" : "Create account"}
        </button>
      </form>
      <p className="muted">
        {isLogin ? (
          <>
            No account? <Link to="/register">Create one</Link>
          </>
        ) : (
          <>
            Already registered? <Link to="/login">Sign in</Link>
          </>
        )}
      </p>
    </main>
  );
}
