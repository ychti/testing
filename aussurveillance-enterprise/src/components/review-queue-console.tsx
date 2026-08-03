"use client";

import { useEffect, useState } from "react";
import { formatDateTime } from "@/lib/format";

interface TenantRecord {
  id: string;
  name: string;
  industry: string;
}

interface LegacyMarkerShape {
  id?: string;
  lat: number;
  lng: number;
  type: string;
  cctvMode?: string | null;
  direction?: number | null;
  notes?: string | null;
  source?: string;
  quality?: {
    confidenceScore?: number | null;
    confidenceBand?: string | null;
  } | null;
}

interface ReviewCandidate {
  id: string;
  sourceLabel?: string;
  marker: LegacyMarkerShape;
  status: "pending" | "approved" | "rejected";
  submittedAt: string;
  submittedBy: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewerNote?: string;
  exportedAt?: string;
}

interface QueueStats {
  pending: number;
  approved: number;
  rejected: number;
  exported: number;
  total: number;
}

function extractMarkers(payload: unknown): LegacyMarkerShape[] {
  if (Array.isArray(payload)) {
    return payload as LegacyMarkerShape[];
  }
  if (payload && typeof payload === "object") {
    const asRecord = payload as Record<string, unknown>;
    if (Array.isArray(asRecord.markers)) {
      return asRecord.markers as LegacyMarkerShape[];
    }
    if (Array.isArray(asRecord.items)) {
      return asRecord.items as LegacyMarkerShape[];
    }
  }
  return [];
}

export function ReviewQueueConsole() {
  const [tenants, setTenants] = useState<TenantRecord[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [status, setStatus] = useState("Loading review queue...");
  const [loading, setLoading] = useState(false);
  const [reviewerNote, setReviewerNote] = useState("");
  const [sourceLabel, setSourceLabel] = useState("google-surveillance-batch");
  const [candidate, setCandidate] = useState<ReviewCandidate | null>(null);
  const [stats, setStats] = useState<QueueStats>({
    pending: 0,
    approved: 0,
    rejected: 0,
    exported: 0,
    total: 0,
  });

  async function loadTenants() {
    const response = await fetch("/api/v1/tenants");
    const payload = (await response.json()) as
      | { tenants: TenantRecord[] }
      | { error?: string };
    if (!response.ok || !("tenants" in payload)) {
      throw new Error(payload.error ?? "Failed to load tenants.");
    }
    setTenants(payload.tenants);
    const persisted =
      typeof window !== "undefined"
        ? window.localStorage.getItem("aus-intel-tenant-id")
        : null;
    const initial =
      (persisted &&
        payload.tenants.find((tenant) => tenant.id === persisted)?.id) ||
      payload.tenants[0]?.id ||
      "";
    setSelectedTenantId((current) => current || initial);
    return initial;
  }

  async function loadNextCandidate(tenantId: string) {
    if (!tenantId) {
      setCandidate(null);
      return;
    }
    const response = await fetch(
      `/api/v1/review-candidates/next?tenantId=${encodeURIComponent(tenantId)}`,
    );
    const payload = (await response.json()) as
      | { candidate: ReviewCandidate | null; stats: QueueStats; error?: string }
      | { error: string };
    if (!response.ok || !("candidate" in payload)) {
      throw new Error(("error" in payload && payload.error) || "Queue fetch failed.");
    }
    setCandidate(payload.candidate);
    setStats(payload.stats);
  }

  async function bootstrap() {
    setLoading(true);
    try {
      const initialTenantId = await loadTenants();
      if (!initialTenantId) {
        setStatus("No tenant found. Create one first in Migration.");
        setCandidate(null);
        return;
      }
      await loadNextCandidate(initialTenantId);
      setStatus("Review queue ready. Swipe left/right or click cross/check.");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Failed to load review queue.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void bootstrap();
  }, []);

  useEffect(() => {
    if (!selectedTenantId) {
      return;
    }
    if (typeof window !== "undefined") {
      window.localStorage.setItem("aus-intel-tenant-id", selectedTenantId);
    }
    const timer = window.setTimeout(() => {
      void loadNextCandidate(selectedTenantId).catch((error: unknown) => {
        setStatus(
          error instanceof Error ? error.message : "Failed to refresh queue.",
        );
      });
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [selectedTenantId]);

  async function handleUploadFile(file: File) {
    if (!selectedTenantId) {
      setStatus("Select a tenant before uploading candidates.");
      return;
    }
    setLoading(true);
    try {
      const raw = await file.text();
      const payload = JSON.parse(raw) as unknown;
      const markers = extractMarkers(payload);
      if (markers.length === 0) {
        setStatus("No markers found. Expected JSON array or { markers: [] }.");
        return;
      }
      const response = await fetch("/api/v1/review-candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: selectedTenantId,
          sourceLabel: sourceLabel.trim() || undefined,
          markers,
        }),
      });
      const body = (await response.json()) as
        | { createdCount: number; skippedCount: number; stats: QueueStats; error?: string }
        | { error: string };
      if (!response.ok || !("createdCount" in body)) {
        setStatus(("error" in body && body.error) || "Failed to queue markers.");
        return;
      }
      setStats(body.stats);
      await loadNextCandidate(selectedTenantId);
      setStatus(
        `Queued ${body.createdCount} candidates (${body.skippedCount} duplicates skipped).`,
      );
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Failed to parse/upload file.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleDecision(decision: "approve" | "reject") {
    if (!selectedTenantId || !candidate) {
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/v1/review-candidates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: selectedTenantId,
          candidateId: candidate.id,
          decision,
          reviewerNote: reviewerNote.trim() || undefined,
        }),
      });
      const body = (await response.json()) as
        | { stats: QueueStats; error?: string }
        | { error: string };
      if (!response.ok || !("stats" in body)) {
        setStatus(("error" in body && body.error) || "Failed to save decision.");
        return;
      }
      setStats(body.stats);
      setReviewerNote("");
      await loadNextCandidate(selectedTenantId);
      setStatus(
        decision === "approve"
          ? "Marked as verified CCTV."
          : "Rejected and moved to non-CCTV set.",
      );
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Failed to update candidate.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function downloadApprovedJson() {
    if (!selectedTenantId) {
      return;
    }
    try {
      const response = await fetch(
        `/api/v1/review-candidates/export?tenantId=${encodeURIComponent(selectedTenantId)}&unexportedOnly=false`,
      );
      const body = (await response.json()) as
        | { markers: LegacyMarkerShape[]; error?: string }
        | { error: string };
      if (!response.ok || !("markers" in body)) {
        setStatus(("error" in body && body.error) || "Failed to export approved markers.");
        return;
      }
      const blob = new Blob([JSON.stringify({ markers: body.markers }, null, 2)], {
        type: "application/json;charset=utf-8",
      });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `${selectedTenantId}-approved-cctv.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
      setStatus(`Downloaded ${body.markers.length} approved markers.`);
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Failed to download export.",
      );
    }
  }

  async function importApprovedToPortfolio() {
    if (!selectedTenantId) {
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/v1/import/review-approved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: selectedTenantId,
          unexportedOnly: true,
        }),
      });
      const body = (await response.json()) as
        | { runId: string; importedMarkers: number; summary: { totalSites: number }; error?: string }
        | { error: string };
      if (!response.ok || !("runId" in body)) {
        setStatus(("error" in body && body.error) || "Failed to import approved markers.");
        return;
      }
      await loadNextCandidate(selectedTenantId);
      setStatus(
        `Imported ${body.importedMarkers} approved markers (run ${body.runId}, ${body.summary.totalSites} sites).`,
      );
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Failed to import approved markers.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    function onKeydown(event: KeyboardEvent) {
      if (!candidate || loading) {
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        void handleDecision("reject");
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        void handleDecision("approve");
      }
    }
    window.addEventListener("keydown", onKeydown);
    return () => {
      window.removeEventListener("keydown", onKeydown);
    };
  }, [candidate, loading, reviewerNote, selectedTenantId]);

  const mapUrl = candidate
    ? `https://www.google.com/maps?q=${candidate.marker.lat},${candidate.marker.lng}`
    : "";
  const confidence = candidate?.marker.quality?.confidenceScore;

  return (
    <section className="space-y-6 rounded-2xl border border-white/10 bg-slate-900/70 p-6">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-[240px] flex-1 flex-col gap-2 text-sm text-slate-300">
          Tenant workspace
          <select
            value={selectedTenantId}
            onChange={(event) => setSelectedTenantId(event.target.value)}
            className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
          >
            {tenants.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>
                {tenant.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[260px] flex-1 flex-col gap-2 text-sm text-slate-300">
          Source label
          <input
            type="text"
            value={sourceLabel}
            onChange={(event) => setSourceLabel(event.target.value)}
            className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
            placeholder="google-surveillance-batch-3"
          />
        </label>
        <label className="flex min-w-[260px] flex-1 cursor-pointer flex-col gap-2 text-sm text-slate-300">
          Queue new candidates JSON
          <input
            type="file"
            accept="application/json"
            className="rounded-lg border border-dashed border-white/20 bg-slate-950 px-3 py-2 text-xs text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-cyan-500/20 file:px-3 file:py-1 file:text-cyan-100"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) {
                return;
              }
              void handleUploadFile(file);
              event.target.value = "";
            }}
          />
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        <div className="rounded-xl border border-white/10 bg-slate-950/70 p-3">
          <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Pending</p>
          <p className="mt-1 text-xl font-semibold text-amber-200">{stats.pending}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-slate-950/70 p-3">
          <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Approved</p>
          <p className="mt-1 text-xl font-semibold text-emerald-200">{stats.approved}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-slate-950/70 p-3">
          <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Rejected</p>
          <p className="mt-1 text-xl font-semibold text-rose-200">{stats.rejected}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-slate-950/70 p-3">
          <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Exported</p>
          <p className="mt-1 text-xl font-semibold text-cyan-200">{stats.exported}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-slate-950/70 p-3">
          <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Total</p>
          <p className="mt-1 text-xl font-semibold text-white">{stats.total}</p>
        </div>
      </div>

      <article className="rounded-2xl border border-white/10 bg-slate-950/70 p-5">
        {candidate ? (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-cyan-200">
                  Next CCTV candidate
                </p>
                <h3 className="mt-1 text-xl font-semibold text-white">
                  {candidate.marker.type.toUpperCase()} @{" "}
                  {candidate.marker.lat.toFixed(6)}, {candidate.marker.lng.toFixed(6)}
                </h3>
                <p className="mt-2 text-sm text-slate-300">
                  Source: {candidate.sourceLabel ?? candidate.marker.source ?? "unknown"} •
                  Submitted {formatDateTime(candidate.submittedAt)}
                </p>
              </div>
              <a
                href={mapUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-cyan-400/40 px-3 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/10"
              >
                Open map location
              </a>
            </div>

            <div className="grid gap-3 text-sm text-slate-200 md:grid-cols-2">
              <p>
                Confidence:{" "}
                <span className="font-semibold text-white">
                  {typeof confidence === "number" ? `${confidence.toFixed(1)}` : "N/A"}
                </span>
              </p>
              <p>
                CCTV mode:{" "}
                <span className="font-semibold text-white">
                  {candidate.marker.cctvMode ?? "unknown"}
                </span>
              </p>
              <p>
                Bearing:{" "}
                <span className="font-semibold text-white">
                  {typeof candidate.marker.direction === "number"
                    ? `${Math.round(candidate.marker.direction)}°`
                    : "unknown"}
                </span>
              </p>
              <p>
                Marker id:{" "}
                <span className="font-semibold text-white">
                  {candidate.marker.id ?? candidate.id}
                </span>
              </p>
            </div>

            <label className="block space-y-2 text-sm text-slate-300">
              Reviewer note (optional)
              <textarea
                value={reviewerNote}
                onChange={(event) => setReviewerNote(event.target.value)}
                className="h-20 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white"
                placeholder="Why accepted or rejected"
              />
            </label>

            <div className="grid gap-3 md:grid-cols-2">
              <button
                type="button"
                disabled={loading}
                onClick={() => void handleDecision("reject")}
                className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-100 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                ✕ Cross / Not CCTV (Swipe Left)
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => void handleDecision("approve")}
                className="rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                ✓ Check / Verified CCTV (Swipe Right)
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-lg font-semibold text-white">Queue clear</p>
            <p className="text-sm text-slate-300">
              No pending candidates. Upload a JSON batch from your surveillance agent to continue.
            </p>
          </div>
        )}
      </article>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={loading}
          onClick={() => void importApprovedToPortfolio()}
          className="rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Import approved markers to portfolio
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => void downloadApprovedJson()}
          className="rounded-lg border border-white/20 bg-slate-950 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Download approved markers JSON
        </button>
      </div>

      <p className="text-sm text-slate-400">{status}</p>
    </section>
  );
}
