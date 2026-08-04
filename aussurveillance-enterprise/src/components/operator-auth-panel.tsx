"use client";

import { useEffect, useState } from "react";

interface SessionState {
  authenticated: boolean;
  actorId?: string;
  email?: string;
  role?: string;
  scopes?: string[];
}

const DEFAULT_EMAIL = "admin@aussurveillance.local";

export function OperatorAuthPanel() {
  const [session, setSession] = useState<SessionState>({ authenticated: false });
  const [email, setEmail] = useState(DEFAULT_EMAIL);
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("Checking session...");
  const [loading, setLoading] = useState(false);

  async function refreshSession(updateLoading = true) {
    if (updateLoading) {
      setLoading(true);
    }
    try {
      const response = await fetch("/api/v1/auth/me", { method: "GET" });
      const data = (await response.json()) as SessionState;
      if (data.authenticated) {
        setSession(data);
        setStatus(`Authenticated as ${data.email}`);
      } else {
        setSession({ authenticated: false });
        setStatus("Not authenticated. Use operator login.");
      }
    } catch {
      setSession({ authenticated: false });
      setStatus("Session check failed.");
    } finally {
      if (updateLoading) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function checkSessionOnMount() {
      try {
        const response = await fetch("/api/v1/auth/me", { method: "GET" });
        const data = (await response.json()) as SessionState;
        if (cancelled) {
          return;
        }
        if (data.authenticated) {
          setSession(data);
          setStatus(`Authenticated as ${data.email}`);
        } else {
          setSession({ authenticated: false });
          setStatus("Not authenticated. Use operator login.");
        }
      } catch {
        if (!cancelled) {
          setSession({ authenticated: false });
          setStatus("Session check failed.");
        }
      }
    }
    void checkSessionOnMount();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setStatus("Signing in...");
    try {
      const response = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await response.json()) as
        | { ok: boolean; email: string }
        | { error: string };

      if (!response.ok) {
        setStatus("Login failed: " + ("error" in data ? data.error : "unknown"));
        return;
      }
      setPassword("");
      await refreshSession();
    } catch {
      setStatus("Login request failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    setLoading(true);
    try {
      await fetch("/api/v1/auth/logout", { method: "POST" });
      setSession({ authenticated: false });
      setStatus("Logged out.");
    } catch {
      setStatus("Logout failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-white/10 bg-slate-900/65 p-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold text-white">Operator authentication</h2>
        <p className="text-sm text-slate-300">
          API access is protected. Sign in here to use migration and Firestore
          ingestion workflows without manually sending API keys.
        </p>
      </div>

      <p className="text-sm text-slate-300">{status}</p>

      {session.authenticated ? (
        <div className="space-y-3">
          <div className="rounded-xl border border-emerald-300/35 bg-emerald-400/10 p-3 text-sm text-emerald-100">
            Active session for {session.email} ({session.role})
          </div>
          <button
            type="button"
            onClick={handleLogout}
            disabled={loading}
            className="rounded-lg border border-white/15 bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/5 disabled:opacity-60"
          >
            Sign out
          </button>
        </div>
      ) : (
        <form className="grid gap-3 md:grid-cols-[1fr_1fr_auto]" onSubmit={handleLogin}>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="rounded-lg border border-white/15 bg-slate-950 px-3 py-2 text-sm text-slate-200"
            placeholder="admin@aussurveillance.local"
            required
          />
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="rounded-lg border border-white/15 bg-slate-950 px-3 py-2 text-sm text-slate-200"
            placeholder="operator password"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:opacity-60"
          >
            Sign in
          </button>
        </form>
      )}
    </section>
  );
}

