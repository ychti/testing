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

## API Endpoints

- `GET /api/v1/portfolio`
- `GET /api/v1/sites`
- `GET /api/v1/site?siteId=<id>`

## Core Engine

The scoring engine lives in `src/lib/security-intelligence.ts` and includes:
- source-aware trust weighting
- freshness decay by volatility
- coverage/blind-spot/lighting/maintenance model
- portfolio exposure estimation and remediation recommendations

## Blueprint

A complete business and product architecture guide is included at:

`docs/enterprise-blueprint.md`

## Local Development

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Quality Checks

```bash
npm run lint
npm run build
```
