"use client";

import { useEffect, useMemo, useState } from "react";
import { MetricCard } from "@/components/metric-card";
import { ProgressMeter } from "@/components/progress-meter";
import { SiteRiskTable } from "@/components/site-risk-table";
import { formatCurrencyAud } from "@/lib/format";
import type { PortfolioSummary } from "@/lib/scoring-engine";

interface LivePlatformOverviewProps {
  fallbackSummary: PortfolioSummary;
}

export function LivePlatformOverview({ fallbackSummary }: LivePlatformOverviewProps) {
  const [summary, setSummary] = useState<PortfolioSummary>(fallbackSummary);
  const [status, setStatus] = useState("Using latest available portfolio snapshot.");

  useEffect(() => {
    async function hydrateFromTenantSnapshot() {
      const tenantId =
        typeof window !== "undefined"
          ? window.localStorage.getItem("aus-intel-tenant-id")
          : null;
      if (!tenantId) {
        return;
      }
      try {
        const response = await fetch(
          `/api/v1/portfolio/latest?tenantId=${encodeURIComponent(tenantId)}`,
        );
        const payload = await response.json();
        if (!response.ok || !payload?.summary) {
          setStatus(
            "No saved snapshot found for selected tenant. Showing baseline demo portfolio.",
          );
          return;
        }
        setSummary(payload.summary as PortfolioSummary);
        setStatus(
          `Displaying persisted tenant snapshot ${payload.runId ?? ""}`.trim(),
        );
      } catch {
        setStatus("Failed to load tenant snapshot. Showing baseline demo portfolio.");
      }
    }
    void hydrateFromTenantSnapshot();
  }, []);

  const highestExposure = useMemo(() => {
    return [...summary.sites].sort(
      (a, b) => b.estimatedMonthlyExposureAud - a.estimatedMonthlyExposureAud,
    )[0];
  }, [summary]);

  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <p className="text-xs uppercase tracking-[0.18em] text-cyan-200">
          Platform command center
        </p>
        <h1 className="text-4xl font-semibold text-white">Portfolio Risk Ops</h1>
        <p className="max-w-3xl text-slate-300">
          Every signal shown below is freshness-weighted and confidence-aware so
          teams can decide quickly without digging through raw mapping artifacts.
        </p>
        <p className="text-sm text-slate-400">{status}</p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Total sites"
          value={summary.totalSites.toString()}
          detail={`${summary.protectedSites} currently within policy tolerance.`}
        />
        <MetricCard
          label="At-risk sites"
          value={summary.atRiskSites.toString()}
          detail="Sites below risk score 65 prioritized for remediation."
        />
        <MetricCard
          label="Portfolio exposure"
          value={formatCurrencyAud(summary.estimatedMonthlyExposureAud)}
          detail="Modelled monthly exposure based on current site posture."
        />
        <MetricCard
          label="Highest exposure site"
          value={highestExposure?.site.name ?? "n/a"}
          detail={
            highestExposure
              ? formatCurrencyAud(highestExposure.estimatedMonthlyExposureAud)
              : "No data"
          }
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        <SiteRiskTable rows={summary.sites} />
        <aside className="space-y-4 rounded-2xl border border-white/10 bg-slate-900/65 p-5">
          <h2 className="text-lg font-semibold text-white">Signal health</h2>
          <p className="text-sm text-slate-300">
            Data quality metrics used by underwriting and security operations.
          </p>
          <ProgressMeter
            label="Portfolio risk score"
            value={summary.portfolioRiskScore}
          />
          <ProgressMeter
            label="Portfolio freshness score"
            value={summary.portfolioFreshnessScore}
          />
          <ProgressMeter
            label="Portfolio confidence score"
            value={summary.portfolioConfidenceScore}
          />
          <ProgressMeter
            label="Policy-compliant sites"
            value={Math.round(
              (summary.protectedSites / Math.max(summary.totalSites, 1)) * 100,
            )}
          />
        </aside>
      </section>
    </div>
  );
}

