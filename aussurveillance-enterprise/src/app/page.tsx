import Link from "next/link";
import { MetricCard } from "@/components/metric-card";
import { SiteRiskTable } from "@/components/site-risk-table";
import { formatCurrencyAud } from "@/lib/format";
import { getPortfolioSummary } from "@/lib/security-intelligence";

export default function Home() {
  const portfolio = getPortfolioSummary();
  const criticalSites = portfolio.sites.filter((site) => site.riskScore < 65);

  return (
    <div className="space-y-14 pb-10">
      <section className="grid gap-8 rounded-3xl border border-white/10 bg-slate-900/60 p-8 shadow-[0_30px_60px_rgba(2,6,23,0.6)] lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <p className="inline-flex rounded-full border border-cyan-300/35 bg-cyan-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100">
            Enterprise-grade risk intelligence
          </p>
          <h1 className="text-4xl font-semibold leading-tight text-white md:text-5xl">
            Turn camera observations into underwriting-grade security signals.
          </h1>
          <p className="max-w-2xl text-lg text-slate-300">
            AUSSurveillance Intelligence converts crowd, partner, and audit
            observations into confidence-scored site risk indices, blind-spot
            alerts, and portfolio-level exposure forecasting.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/platform"
              className="rounded-full bg-cyan-300 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"
            >
              Explore the platform
            </Link>
            <Link
              href="/trust"
              className="rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/5"
            >
              Review trust controls
            </Link>
          </div>
        </div>
        <div className="space-y-4 rounded-2xl border border-white/10 bg-slate-950/70 p-6">
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-400">
            Executive snapshot
          </h2>
          <div className="space-y-3 text-sm text-slate-200">
            <p className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2">
              <span>Portfolio risk score</span>
              <span className="font-semibold text-white">
                {portfolio.portfolioRiskScore}
              </span>
            </p>
            <p className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2">
              <span>Confidence score</span>
              <span className="font-semibold text-white">
                {portfolio.portfolioConfidenceScore}
              </span>
            </p>
            <p className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2">
              <span>At-risk sites</span>
              <span className="font-semibold text-white">{portfolio.atRiskSites}</span>
            </p>
            <p className="flex items-center justify-between rounded-lg bg-rose-300/10 px-3 py-2 text-rose-100">
              <span>Estimated monthly exposure</span>
              <span className="font-semibold">
                {formatCurrencyAud(portfolio.estimatedMonthlyExposureAud)}
              </span>
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Portfolio risk"
          value={`${portfolio.portfolioRiskScore}/100`}
          detail="Composite score from coverage, blind spots, maintenance and lighting."
        />
        <MetricCard
          label="Freshness"
          value={`${portfolio.portfolioFreshnessScore}/100`}
          detail="Age-decay weighted by environmental volatility and source authority."
        />
        <MetricCard
          label="Confidence"
          value={`${portfolio.portfolioConfidenceScore}/100`}
          detail="Signals from verifier quality, contributor reputation, and source trust."
        />
        <MetricCard
          label="Annualized leakage"
          value={formatCurrencyAud(portfolio.estimatedMonthlyExposureAud * 12)}
          detail="Exposure estimate created for underwriting and security operations."
        />
      </section>

      <section className="grid gap-8 lg:grid-cols-[1.35fr_1fr]">
        <div className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-2xl font-semibold text-white">
              Site security posture intelligence
            </h2>
            <p className="text-slate-300">
              Teams consume this table as a decision surface, not as raw map data.
            </p>
          </div>
          <SiteRiskTable rows={portfolio.sites} />
        </div>
        <aside className="space-y-4 rounded-2xl border border-white/10 bg-slate-900/65 p-5">
          <h3 className="text-lg font-semibold text-white">Immediate interventions</h3>
          <p className="text-sm text-slate-300">
            Prioritized recommendations for elevated and critical sites.
          </p>
          <ul className="space-y-4">
            {criticalSites.map((site) => (
              <li
                key={site.site.id}
                className="rounded-xl border border-white/10 bg-slate-950/75 p-3"
              >
                <p className="font-medium text-white">{site.site.name}</p>
                <p className="mt-1 text-xs text-slate-400">
                  Risk {site.riskScore} · Trend {site.trendDelta >= 0 ? "+" : ""}
                  {site.trendDelta}
                </p>
                <p className="mt-2 text-sm text-slate-200">
                  {site.recommendedActions[0]}
                </p>
              </li>
            ))}
          </ul>
        </aside>
      </section>

      <section className="grid gap-4 rounded-3xl border border-white/10 bg-gradient-to-r from-cyan-400/10 via-indigo-500/10 to-slate-900 p-8 lg:grid-cols-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-cyan-100">
            Why enterprises buy
          </p>
          <p className="mt-3 text-xl font-semibold text-white">
            Outcomes that plug directly into underwriting and risk operations.
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4 text-sm text-slate-200">
          <p className="font-semibold text-white">Coverage score API</p>
          <p className="mt-2">
            Real-time access to confidence and freshness aware site ratings.
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4 text-sm text-slate-200">
          <p className="font-semibold text-white">Blind-spot alerts</p>
          <p className="mt-2">
            Notifies teams when risk degrades beyond policy tolerance thresholds.
          </p>
        </div>
      </section>
    </div>
  );
}
