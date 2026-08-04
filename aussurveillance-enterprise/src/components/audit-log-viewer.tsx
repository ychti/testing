"use client";

import { useState } from "react";

interface AuditEvent {
  timestamp: string;
  action: string;
  status: "success" | "denied" | "error";
  actorId: string;
  actorEmail?: string;
  tenant?: string;
  authMethod?: string;
  method: string;
  path: string;
  ip: string;
  details?: Record<string, unknown>;
}

export function AuditLogViewer() {
  const [status, setStatus] = useState("Load audit events.");
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(false);

  async function loadEvents() {
    setLoading(true);
    setStatus("Loading...");
    try {
      const response = await fetch("/api/v1/audit?limit=80");
      const payload = (await response.json()) as
        | { count: number; events: AuditEvent[] }
        | { error: string };
      if (!response.ok) {
        setStatus("Failed: " + ("error" in payload ? payload.error : "unknown"));
        setEvents([]);
        return;
      }
      const parsed = payload as { count: number; events: AuditEvent[] };
      setEvents(parsed.events);
      setStatus(`Loaded ${parsed.count} events.`);
    } catch (error) {
      setStatus(
        `Failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-white/10 bg-slate-900/65 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-white">Audit log viewer</h2>
          <p className="text-sm text-slate-300">Session/API access and pipeline traces.</p>
        </div>
        <button
          type="button"
          onClick={() => void loadEvents()}
          disabled={loading}
          className="rounded-lg bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:opacity-60"
        >
          Refresh logs
        </button>
      </div>
      <p className="text-sm text-slate-300">{status}</p>
      <div className="max-h-[420px] space-y-2 overflow-auto rounded-xl border border-white/10 bg-slate-950/55 p-3">
        {events.length === 0 ? (
          <p className="text-sm text-slate-400">No events loaded yet.</p>
        ) : (
          events
            .slice()
            .reverse()
            .map((event, index) => (
              <article
                key={`${event.timestamp}-${index}`}
                className="rounded-lg border border-white/10 bg-slate-900/70 p-3 text-xs text-slate-200"
              >
                <p className="font-semibold text-white">
                  {event.action} · {event.status}
                </p>
                <p className="mt-1 text-slate-400">
                  {event.timestamp} · {event.method} {event.path}
                </p>
                <p className="mt-1 text-slate-400">
                  actor: {event.actorId}
                  {event.actorEmail ? ` (${event.actorEmail})` : ""} · ip: {event.ip}
                </p>
              </article>
            ))
        )}
      </div>
    </section>
  );
}

