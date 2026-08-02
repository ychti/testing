import { getPortfolioSummary } from "@/lib/security-intelligence";

export default function ApiDocsPage() {
  const summary = getPortfolioSummary();
  const preview = {
    asOf: summary.asOf,
    portfolioRiskScore: summary.portfolioRiskScore,
    totalSites: summary.totalSites,
    sampleSite: summary.sites[0],
  };

  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <p className="text-xs uppercase tracking-[0.18em] text-cyan-200">API</p>
        <h1 className="text-4xl font-semibold text-white">
          Risk Intelligence API reference
        </h1>
        <p className="max-w-3xl text-slate-300">
          Connect insurer and security workflows directly to normalized posture
          scores, exposure estimates, and recommendation feeds.
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-white/10 bg-slate-900/65 p-5">
          <h2 className="text-lg font-semibold text-white">GET /api/v1/portfolio</h2>
          <p className="mt-2 text-sm text-slate-300">
            Returns portfolio-level summary and ranked site intelligence objects.
          </p>
          <pre className="mt-4 overflow-auto rounded-xl border border-white/10 bg-slate-950 p-4 text-sm text-cyan-100">
            <code>{`curl -s https://your-domain.com/api/v1/portfolio`}</code>
          </pre>
        </article>
        <article className="rounded-2xl border border-white/10 bg-slate-900/65 p-5">
          <h2 className="text-lg font-semibold text-white">GET /api/v1/site</h2>
          <p className="mt-2 text-sm text-slate-300">
            Fetch one scored site by identifier including confidence and
            recommendations.
          </p>
          <pre className="mt-4 overflow-auto rounded-xl border border-white/10 bg-slate-950 p-4 text-sm text-cyan-100">
            <code>
              {`curl -s "https://your-domain.com/api/v1/site?siteId=au-syd-ret-001"`}
            </code>
          </pre>
        </article>
      </section>

      <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-6">
        <h2 className="text-2xl font-semibold text-white">Sample payload</h2>
        <pre className="mt-4 overflow-auto rounded-xl border border-white/10 bg-slate-950 p-4 text-xs text-cyan-100">
          <code>{JSON.stringify(preview, null, 2)}</code>
        </pre>
      </section>
    </div>
  );
}
