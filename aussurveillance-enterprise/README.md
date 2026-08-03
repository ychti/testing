# AUSSurveillance Intelligence

Enterprise-grade physical security risk intelligence platform designed for:
- insurers and underwriters
- security integrators
- multi-site operators

This application demonstrates the transformation from a camera mapping concept into a decision-ready B2B intelligence product.

## Product Surfaces

- **Overview** (`/`): executive positioning and portfolio summary
- **Platform** (`/platform`): operational risk dashboard and site table
- **Methodology** (`/methodology`): explainable scoring model
- **Trust** (`/trust`): governance and compliance controls
- **API Docs** (`/api`): endpoint references and sample payloads
- **Migration Console** (`/migration`): import legacy markers and preview enterprise scoring
- **Customers** (`/customers`): tenant snapshots, trend analytics, import history
- **Operations** (`/operations`): operator auth and audit monitoring

## API Endpoints

- `GET /api/v1/portfolio`
- `GET /api/v1/portfolio/latest?tenantId=<id>`
- `GET /api/v1/portfolio/trend?tenantId=<id>`
- `GET /api/v1/sites`
- `GET /api/v1/site?siteId=<id>`
- `POST /api/v1/import/legacy-markers`
- `POST /api/v1/import/firestore-markers`
- `POST /api/v1/import/live-aus-surveillance` (one-click live pull)
- `POST /api/v1/import/official-state-feeds` (NSW/QLD/VIC/SA/WA/ACT)
- `GET /api/v1/assets?tenantId=<id>`
- `POST /api/v1/assets`
- `GET /api/v1/reports/executive?tenantId=<id>&format=markdown`
- `GET /api/v1/firestore/markers`
- `GET /api/v1/imports/history?tenantId=<id>`
- `GET /api/v1/tenants`
- `POST /api/v1/tenants`
- `GET /api/v1/audit`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`

## Enterprise Features

- tenant persistence for every import run
- tenant asset registry (real named sites + addresses)
- historical trend snapshots (risk/confidence/freshness/exposure deltas)
- underwriting decision mix (approve/conditional/refer/decline)
- exportable executive report generation
- standalone Google surveillance collector scripts (outside web UI)
- workspace-scoped import history
- audited API actions
- rate limiting on high-cost endpoints
- auth fallback strategy for live imports

## Core Engine

The production scoring engine lives in `src/lib/scoring-engine.ts` and includes:
- source-aware trust weighting
- freshness decay by volatility
- coverage/blind-spot/lighting/maintenance model
- calibrated exposure estimation and remediation recommendations
- underwriting decision outputs with required controls

Legacy compatibility and ingestion modules:
- `src/lib/legacy-model.ts` ports the original marker confidence/quality semantics
- `src/lib/legacy-migration.ts` converts legacy markers to enterprise observations/sites and asset-maps to tenant registry
- `src/lib/official-state-feeds.ts` pulls verified multi-state importer feeds

## Blueprint

A complete business and product architecture guide is included at:

`docs/enterprise-blueprint.md`

## Local Development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Then open `http://localhost:3000`.

Default local operator login (change in `.env.local`):
- email: `admin@aussurveillance.local`
- password: `changeme-admin`

To connect real Firestore imports, set:
- `FIREBASE_SERVICE_ACCOUNT_JSON` (or base64 variant)
- `FIREBASE_PROJECT_ID`

Then use `/migration` and click **Import Firestore**.

Easiest path: open `/migration` and click **Import Live Data Now** (operator login optional for this path).
If your Firebase blocks anonymous auth, enter your normal AUS app email/password
in the live import fallback fields on `/migration`.

For local dev convenience, you may set:
- `ALLOW_PUBLIC_LIVE_IMPORT=true`
- `ALLOW_PUBLIC_TENANT_READ=true`
- `ALLOW_PUBLIC_TENANT_WRITE=true`

## Standalone surveillance collector (separate from website)

The Google mapping agent is intentionally kept out of the website UI. Run it as standalone CLI tooling:

```bash
# Create per-agent batch plans from your asset CSV
npm run surveillance:agent -- --assets ./assets.csv --batch-count 6 --plan-only

# Run one specific worker batch (example: agent 2 of 6)
GOOGLE_MAPS_API_KEY=... GOOGLE_VISION_API_KEY=... \
npm run surveillance:agent -- \
  --assets ./assets.csv \
  --batch-count 6 \
  --batch-index 2 \
  --headings 0,90,180,270 \
  --radius-meters 120 \
  --threshold 0.72 \
  --out ./surveillance-batch-2.json

# Merge all worker outputs into one import file
npm run surveillance:merge -- --out ./surveillance-merged.json ./surveillance-batch-*.json
```

`--plan-only` does not require Google API keys; collection runs do.

Then upload merged/single batch JSON files through `/migration` legacy marker upload.

Detailed runbook: `docs/standalone-surveillance-agent.md`

### Production security notes

Before production rollout:
- set non-default `ENTERPRISE_ADMIN_EMAIL` and `ENTERPRISE_ADMIN_PASSWORD`
- set a strong `ENTERPRISE_SESSION_SECRET`
- configure `ENTERPRISE_API_KEYS_JSON` with scoped keys
- set `ALLOW_PUBLIC_LIVE_IMPORT=false`
- set `ALLOW_PUBLIC_TENANT_READ=false`
- move tenant/audit persistence from local files to managed infrastructure

## Quality Checks

```bash
npm run lint
npm run build
```
