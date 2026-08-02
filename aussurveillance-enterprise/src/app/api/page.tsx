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
        <article className="rounded-2xl border border-white/10 bg-slate-900/65 p-5">
          <h2 className="text-lg font-semibold text-white">
            POST /api/v1/import/legacy-markers
          </h2>
          <p className="mt-2 text-sm text-slate-300">
            Ingest legacy marker exports and generate enterprise portfolio risk
            intelligence previews.
          </p>
          <pre className="mt-4 overflow-auto rounded-xl border border-white/10 bg-slate-950 p-4 text-sm text-cyan-100">
            <code>{`curl -X POST https://your-domain.com/api/v1/import/legacy-markers \
  -H "content-type: application/json" \
  -d '{"markers":[{"lat":-33.87,"lng":151.21,"type":"cctv"}]}'`}</code>
          </pre>
        </article>
        <article className="rounded-2xl border border-white/10 bg-slate-900/65 p-5">
          <h2 className="text-lg font-semibold text-white">
            POST /api/v1/import/firestore-markers
          </h2>
          <p className="mt-2 text-sm text-slate-300">
            Pulls real markers from Firestore through server credentials, then
            runs enterprise migration and scoring.
          </p>
          <pre className="mt-4 overflow-auto rounded-xl border border-white/10 bg-slate-950 p-4 text-sm text-cyan-100">
            <code>{`curl -X POST https://your-domain.com/api/v1/import/firestore-markers \
  -H "authorization: Bearer <api-key>" \
  -H "content-type: application/json" \
  -d '{"limit":10000,"updatedAfter":"2026-01-01T00:00:00.000Z"}'`}</code>
          </pre>
        </article>
        <article className="rounded-2xl border border-white/10 bg-slate-900/65 p-5">
          <h2 className="text-lg font-semibold text-white">
            POST /api/v1/import/live-aus-surveillance
          </h2>
          <p className="mt-2 text-sm text-slate-300">
            One-click pull from the live AUS Surveillance Firebase project using
            automatic auth fallback, then converts to enterprise portfolio
            scoring. This endpoint can run without operator login for quick
            onboarding.
          </p>
          <pre className="mt-4 overflow-auto rounded-xl border border-white/10 bg-slate-950 p-4 text-sm text-cyan-100">
            <code>{`curl -X POST https://your-domain.com/api/v1/import/live-aus-surveillance \
  -H "authorization: Bearer <api-key>" \
  -H "content-type: application/json" \
  -d '{"limit":10000}'`}</code>
          </pre>
        </article>
        <article className="rounded-2xl border border-white/10 bg-slate-900/65 p-5">
          <h2 className="text-lg font-semibold text-white">GET /api/v1/audit</h2>
          <p className="mt-2 text-sm text-slate-300">
            Returns recent request audit events for compliance and incident
            review. Requires `audit:read` scope.
          </p>
          <pre className="mt-4 overflow-auto rounded-xl border border-white/10 bg-slate-950 p-4 text-sm text-cyan-100">
            <code>{`curl -s https://your-domain.com/api/v1/audit?limit=50 \
  -H "authorization: Bearer <api-key>"`}</code>
          </pre>
        </article>
        <article className="rounded-2xl border border-white/10 bg-slate-900/65 p-5">
          <h2 className="text-lg font-semibold text-white">GET/POST /api/v1/tenants</h2>
          <p className="mt-2 text-sm text-slate-300">
            Manage customer workspaces. Every import run is persisted to a tenant
            for historical reporting and trend analysis.
          </p>
          <pre className="mt-4 overflow-auto rounded-xl border border-white/10 bg-slate-950 p-4 text-sm text-cyan-100">
            <code>{`curl -X POST https://your-domain.com/api/v1/tenants \
  -H "authorization: Bearer <api-key>" \
  -H "content-type: application/json" \
  -d '{"name":"Acme Underwriting","industry":"insurance"}'`}</code>
          </pre>
        </article>
        <article className="rounded-2xl border border-white/10 bg-slate-900/65 p-5">
          <h2 className="text-lg font-semibold text-white">
            GET /api/v1/portfolio/latest and /api/v1/portfolio/trend
          </h2>
          <p className="mt-2 text-sm text-slate-300">
            Retrieve latest saved tenant snapshot and longitudinal KPI trend for
            executive reporting.
          </p>
          <pre className="mt-4 overflow-auto rounded-xl border border-white/10 bg-slate-950 p-4 text-sm text-cyan-100">
            <code>{`curl -s "https://your-domain.com/api/v1/portfolio/latest?tenantId=tenant-123" \
  -H "authorization: Bearer <api-key>"`}</code>
          </pre>
        </article>
      </section>

      <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-6">
        <h2 className="text-2xl font-semibold text-white">Authentication model</h2>
        <ul className="mt-4 space-y-2 text-sm text-slate-300">
          <li>
            Operator session login: <code>POST /api/v1/auth/login</code> with email
            + password.
          </li>
          <li>
            API key auth: pass key via <code>Authorization: Bearer &lt;key&gt;</code>{" "}
            or <code>x-api-key</code>.
          </li>
          <li>
            Session introspection: <code>GET /api/v1/auth/me</code>.
          </li>
          <li>
            Session logout: <code>POST /api/v1/auth/logout</code>.
          </li>
          <li>
            All high-cost endpoints are rate limited and return HTTP 429 with{" "}
            <code>Retry-After</code>.
          </li>
        </ul>
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
