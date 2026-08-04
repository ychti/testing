"use client";

import { useEffect, useMemo, useState } from "react";
import { MetricCard } from "@/components/metric-card";
import { SiteRiskTable } from "@/components/site-risk-table";
import { formatCurrencyAud, formatDateTime } from "@/lib/format";
import type { SiteScore } from "@/lib/scoring-engine";

interface TenantRecord {
  id: string;
  name: string;
  industry: string;
  ownerEmail?: string;
}

interface LatestSnapshot {
  runId: string;
  importedAt: string;
  source: string;
  summary: {
    portfolioRiskScore: number;
    portfolioFreshnessScore: number;
    portfolioConfidenceScore: number;
    estimatedMonthlyExposureAud: number;
    atRiskSites: number;
    totalSites: number;
    underwriting?: {
      approve: number;
      conditional: number;
      refer: number;
      decline: number;
    };
    sites: SiteScore[];
  };
}

interface TrendPoint {
  runId: string;
  recordedAt: string;
  riskScore: number;
  confidenceScore: number;
  freshnessScore: number;
  exposureAud: number;
}

interface ImportHistoryRun {
  id: string;
  source: string;
  authMode?: string;
  createdAt: string;
  ingestion: {
    markersReceived: number;
    markersAccepted: number;
    invalidMarkers: number;
  };
}

export function CustomerIntelligenceConsole() {
  const [tenants, setTenants] = useState<TenantRecord[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string>("");
  const [latest, setLatest] = useState<LatestSnapshot | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [history, setHistory] = useState<ImportHistoryRun[]>([]);
  const [status, setStatus] = useState("Loading customer workspaces...");
  const [loading, setLoading] = useState(false);

  async function loadTenants() {
    const response = await fetch("/api/v1/tenants");
    const payload = (await response.json()) as
      | { tenants: TenantRecord[] }
      | { error: string };
    if (!response.ok || !("tenants" in payload)) {
      throw new Error("Failed to load tenants.");
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

  async function loadTenantData(tenantId: string) {
    if (!tenantId) {
      return;
    }
    setLoading(true);
    setStatus("Loading tenant intelligence...");
    try {
      const [latestRes, trendRes, historyRes] = await Promise.all([
        fetch(`/api/v1/portfolio/latest?tenantId=${encodeURIComponent(tenantId)}`),
        fetch(`/api/v1/portfolio/trend?tenantId=${encodeURIComponent(tenantId)}&limit=30`),
        fetch(`/api/v1/imports/history?tenantId=${encodeURIComponent(tenantId)}&limit=30`),
      ]);

      const latestPayload = await latestRes.json();
      const trendPayload = await trendRes.json();
      const historyPayload = await historyRes.json();

      if (!latestRes.ok) {
        setLatest(null);
        setTrend([]);
        setHistory([]);
        setStatus(
          typeof latestPayload?.error === "string"
            ? latestPayload.error
            : "No snapshot yet for this tenant. Run an import from Migration.",
        );
        return;
      }
      if (!trendRes.ok || !historyRes.ok) {
        setStatus("Loaded latest snapshot, but trend/history fetch failed.");
      } else {
        setStatus("Tenant intelligence loaded.");
      }
      setLatest(latestPayload as LatestSnapshot);
      setTrend(Array.isArray(trendPayload.points) ? trendPayload.points : []);
      setHistory(Array.isArray(historyPayload.runs) ? historyPayload.runs : []);
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Failed to load tenant intelligence.",
      );
      setLatest(null);
      setTrend([]);
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }

  async function downloadExecutiveReport() {
    if (!selectedTenantId) {
      setStatus("Select a tenant before exporting reports.");
      return;
    }
    try {
      const response = await fetch(
        `/api/v1/reports/executive?tenantId=${encodeURIComponent(selectedTenantId)}&format=markdown`,
      );
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setStatus(payload.error ?? "Failed to generate report.");
        return;
      }
      const markdown = await response.text();
      const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `${selectedTenantId}-executive-report.md`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
      setStatus("Executive report downloaded.");
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Failed to export executive report.",
      );
    }
  }

  useEffect(() => {
    let mounted = true;
    async function bootstrap() {
      try {
        const initialTenantId = await loadTenants();
        if (!mounted) {
          return;
        }
        if (initialTenantId) {
          await loadTenantData(initialTenantId);
        } else {
          setStatus("No tenant available yet. Create one in Migration.");
        }
      } catch (error) {
        if (!mounted) {
          return;
        }
        setStatus(
          error instanceof Error
            ? error.message
            : "Failed to load customer workspaces.",
        );
      }
    }
    void bootstrap();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedTenantId) {
      return;
    }
    if (typeof window !== "undefined") {
      window.localStorage.setItem("aus-intel-tenant-id", selectedTenantId);
    }
  }, [selectedTenantId]);

  const trendSummary = useMemo(() => {
    if (trend.length < 2) {
      return null;
    }
    const first = trend[0];
    const last = trend[trend.length - 1];
    return {
      riskDelta: last.riskScore - first.riskScore,
      confidenceDelta: last.confidenceScore - first.confidenceScore,
      exposureDelta: last.exposureAud - first.exposureAud,
    };
  }, [trend]);

  const underwritingSummary = latest?.summary.underwriting ?? {
    approve: 0,
    conditional: 0,
    refer: 0,
    decline: 0,
  };

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-white/10 bg-slate-900/65 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
              Workspace selection
            </p>
            <h2 className="text-xl font-semibold text-white">
              Tenant analytics console
            </h2>
          </div>
          <button
            type="button"
            onClick={() => void loadTenantData(selectedTenantId)}
            disabled={loading || !selectedTenantId}
            className="rounded-lg border border-white/15 bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/5 disabled:opacity-60"
          >
            Refresh tenant data
          </button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
          <select
            value={selectedTenantId}
            onChange={(event) => {
              const next = event.target.value;
              setSelectedTenantId(next);
              void loadTenantData(next);
            }}
            className="rounded-lg border border-white/15 bg-slate-950 px-3 py-2 text-sm text-slate-200"
          >
            {tenants.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>
                {tenant.name} ({tenant.industry})
              </option>
            ))}
          </select>
          <span className="self-center text-xs text-slate-400">{status}</span>
        </div>
      </section>

      {latest ? (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Portfolio risk"
              value={`${latest.summary.portfolioRiskScore}/100`}
              detail={`Snapshot ${formatDateTime(latest.importedAt)}`}
            />
            <MetricCard
              label="Confidence"
              value={`${latest.summary.portfolioConfidenceScore}/100`}
              detail="Model confidence score for latest run."
            />
            <MetricCard
              label="Exposure / month"
              value={formatCurrencyAud(latest.summary.estimatedMonthlyExposureAud)}
              detail="Estimated financial exposure from current posture."
            />
            <MetricCard
              label="At-risk sites"
              value={`${latest.summary.atRiskSites}/${latest.summary.totalSites}`}
              detail={`Run ID ${latest.runId}`}
            />
          </section>

          <section className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
            <SiteRiskTable rows={latest.summary.sites} />
            <aside className="space-y-4 rounded-2xl border border-white/10 bg-slate-900/65 p-5">
              <h3 className="text-lg font-semibold text-white">Trend synopsis</h3>
              {trendSummary ? (
                <div className="space-y-2 text-sm text-slate-200">
                  <p>
                    Risk delta:{" "}
                    <span className="font-semibold">{trendSummary.riskDelta}</span>
                  </p>
                  <p>
                    Confidence delta:{" "}
                    <span className="font-semibold">
                      {trendSummary.confidenceDelta}
                    </span>
                  </p>
                  <p>
                    Exposure delta:{" "}
                    <span className="font-semibold">
                      {formatCurrencyAud(trendSummary.exposureDelta)}
                    </span>
                  </p>
                </div>
              ) : (
                <p className="text-sm text-slate-300">
                  Import at least two runs to view trend deltas.
                </p>
              )}
              <div className="space-y-2">
                {trend.slice(-8).map((point) => (
                  <div
                    key={point.runId}
                    className="rounded-lg border border-white/10 bg-slate-950/65 px-3 py-2 text-xs text-slate-300"
                  >
                    <p className="font-semibold text-white">
                      {formatDateTime(point.recordedAt)}
                    </p>
                    <p>
                      Risk {point.riskScore} · Confidence {point.confidenceScore} ·
                      Exposure {formatCurrencyAud(point.exposureAud)}
                    </p>
                  </div>
                ))}
              </div>
            </aside>
          </section>

          <section className="rounded-2xl border border-white/10 bg-slate-900/65 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-white">Import run history</h3>
              <button
                type="button"
                onClick={() => void downloadExecutiveReport()}
                className="rounded-lg bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"
              >
                Export Executive Report (.md)
              </button>
            </div>
            <div className="mt-3 overflow-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.15em] text-slate-400">
                  <tr>
                    <th className="px-3 py-2">Run</th>
                    <th className="px-3 py-2">Source</th>
                    <th className="px-3 py-2">Markers</th>
                    <th className="px-3 py-2">Invalid</th>
                    <th className="px-3 py-2">Imported</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {history.map((run) => (
                    <tr key={run.id} className="text-slate-200">
                      <td className="px-3 py-2">{run.id.slice(0, 12)}</td>
                      <td className="px-3 py-2">
                        {run.source}
                        {run.authMode ? ` (${run.authMode})` : ""}
                      </td>
                      <td className="px-3 py-2">{run.ingestion.markersAccepted}</td>
                      <td className="px-3 py-2">{run.ingestion.invalidMarkers}</td>
                      <td className="px-3 py-2">{formatDateTime(run.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-slate-900/65 p-5">
            <h3 className="text-lg font-semibold text-white">Underwriting decision panel</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Approve"
                value={String(underwritingSummary.approve)}
                detail="Standard policy terms."
              />
              <MetricCard
                label="Conditional"
                value={String(underwritingSummary.conditional)}
                detail="Coverage with controls required."
              />
              <MetricCard
                label="Refer"
                value={String(underwritingSummary.refer)}
                detail="Escalate for engineering review."
              />
              <MetricCard
                label="Decline"
                value={String(underwritingSummary.decline)}
                detail="Risk posture below threshold."
              />
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

