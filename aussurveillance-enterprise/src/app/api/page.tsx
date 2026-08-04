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
          <h2 className="text-lg font-semibold text-white">GET/POST /api/v1/assets</h2>
          <p className="mt-2 text-sm text-slate-300">
            Store and retrieve tenant asset registries (real named customer sites)
            used to map markers to insurer-facing underwriting entities.
          </p>
          <pre className="mt-4 overflow-auto rounded-xl border border-white/10 bg-slate-950 p-4 text-sm text-cyan-100">
            <code>{`curl -X POST https://your-domain.com/api/v1/assets \
  -H "authorization: Bearer <api-key>" \
  -H "content-type: application/json" \
  -d '{"tenantId":"tenant-123","csv":"name,address,lat,lng\\nHQ,123 Example St,-33.86,151.21"}'`}</code>
          </pre>
        </article>
        <article className="rounded-2xl border border-white/10 bg-slate-900/65 p-5">
          <h2 className="text-lg font-semibold text-white">
            POST /api/v1/import/official-state-feeds
          </h2>
          <p className="mt-2 text-sm text-slate-300">
            Pulls verified multi-state importer feeds (NSW, QLD, VIC, SA, WA, ACT),
            then scores and persists the portfolio snapshot to the selected tenant.
          </p>
          <pre className="mt-4 overflow-auto rounded-xl border border-white/10 bg-slate-950 p-4 text-sm text-cyan-100">
            <code>{`curl -X POST https://your-domain.com/api/v1/import/official-state-feeds \
  -H "content-type: application/json" \
  -d '{"tenantId":"tenant-123","states":["NSW","VIC","ACT"]}'`}</code>
          </pre>
        </article>
        <article className="rounded-2xl border border-white/10 bg-slate-900/65 p-5">
          <h2 className="text-lg font-semibold text-white">
            GET /api/v1/reports/executive
          </h2>
          <p className="mt-2 text-sm text-slate-300">
            Exports a markdown executive report with underwriting mix, top risk
            sites, and recommended controls.
          </p>
          <pre className="mt-4 overflow-auto rounded-xl border border-white/10 bg-slate-950 p-4 text-sm text-cyan-100">
            <code>{`curl -s "https://your-domain.com/api/v1/reports/executive?tenantId=tenant-123&format=markdown"`}</code>
          </pre>
        </article>
        <article className="rounded-2xl border border-white/10 bg-slate-900/65 p-5">
          <h2 className="text-lg font-semibold text-white">
            POST/PATCH /api/v1/review-candidates
          </h2>
          <p className="mt-2 text-sm text-slate-300">
            Queue questionable detections for human review and mark each candidate
            as approved or rejected using check/cross decisions.
          </p>
          <pre className="mt-4 overflow-auto rounded-xl border border-white/10 bg-slate-950 p-4 text-sm text-cyan-100">
            <code>{`curl -X POST https://your-domain.com/api/v1/review-candidates \
  -H "content-type: application/json" \
  -d '{"tenantId":"tenant-123","sourceLabel":"batch-4","markers":[{"lat":-33.87,"lng":151.21,"type":"cctv"}]}'`}</code>
          </pre>
        </article>
        <article className="rounded-2xl border border-white/10 bg-slate-900/65 p-5">
          <h2 className="text-lg font-semibold text-white">
            GET /api/v1/review-candidates/next and POST /api/v1/import/review-approved
          </h2>
          <p className="mt-2 text-sm text-slate-300">
            Fetch the next pending item for swipe-style review, then import only
            approved candidates into scored tenant snapshots.
          </p>
          <pre className="mt-4 overflow-auto rounded-xl border border-white/10 bg-slate-950 p-4 text-sm text-cyan-100">
            <code>{`curl -s "https://your-domain.com/api/v1/review-candidates/next?tenantId=tenant-123"\n\ncurl -X POST https://your-domain.com/api/v1/import/review-approved \\
  -H "authorization: Bearer <api-key>" \\
  -H "content-type: application/json" \\
  -d '{"tenantId":"tenant-123","unexportedOnly":true}'`}</code>
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
