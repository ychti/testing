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
- **Operations** (`/operations`): operator auth and audit monitoring

## API Endpoints

- `GET /api/v1/portfolio`
- `GET /api/v1/sites`
- `GET /api/v1/site?siteId=<id>`
- `POST /api/v1/import/legacy-markers`
- `POST /api/v1/import/firestore-markers`
- `POST /api/v1/import/live-aus-surveillance` (one-click live pull)
- `GET /api/v1/firestore/markers`
- `GET /api/v1/audit`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`

## Core Engine

The scoring engine lives in `src/lib/security-intelligence.ts` and includes:
- source-aware trust weighting
- freshness decay by volatility
- coverage/blind-spot/lighting/maintenance model
- portfolio exposure estimation and remediation recommendations

Legacy compatibility modules:
- `src/lib/legacy-model.ts` ports the original marker confidence/quality semantics
- `src/lib/legacy-migration.ts` converts legacy markers to enterprise observations/sites

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

Easiest path: sign in at `/migration` and click **Import Live Data Now**.

## Quality Checks

```bash
npm run lint
npm run build
```
