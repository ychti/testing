# AUSSurveillance Intelligence Blueprint

This blueprint turns a crowdsourced camera mapping app into an enterprise-grade physical security risk intelligence business.

## 1. Product Positioning Shift

**From:** public camera map  
**To:** risk intelligence platform with confidence-scored outputs

### What customers buy
- Coverage score API per site
- Blind-spot risk index
- Freshness and confidence metadata
- Change alerts and remediation recommendations

## 2. Buyer Segments

1. Commercial insurers and underwriters
2. Security integrators and guard providers
3. Multi-site operators (retail, logistics, healthcare)

## 3. Data Model Requirements

Each observation should include:
- `siteId`, geospatial reference, and timestamp
- Source type (`community`, `integrator`, `customer-audit`)
- Coverage ratio and blind-spot count
- Lighting and maintenance condition
- Verifier confidence and contributor reputation
- Rights/provenance metadata

## 4. Freshness System (No daily full remap required)

Daily full remapping is not required. The platform uses:
- Time decay with half-life linked to site volatility
- Priority refresh queues for high-exposure sites
- Partner and customer audits for targeted verification
- Confidence scores surfaced with every output

This allows operational accuracy without brute-force daily mapping.

## 5. Scoring Method

Core formula:

```text
combinedRisk =
  (1 - weightedCoverage) * 0.45 +
  weightedBlindSpots * 0.30 +
  (1 - weightedLighting) * 0.15 +
  (1 - weightedMaintenance) * 0.10

riskScore = round((1 - combinedRisk) * 100)
```

Weights are multiplied by freshness decay and source confidence.

## 6. Enterprise Trust and Compliance Controls

- Contributor terms with explicit commercial data rights
- Data minimization (no personal identifiers by default)
- Sensitive-location redaction policy
- Role-based access control and audit logs
- API key scoping by tenant and permission class
- Acceptable use terms preventing misuse
- AU legal review before broad commercial rollout

## 7. API and Product Surface

### Public endpoints (current V1)
- `GET /api/v1/portfolio`
- `GET /api/v1/sites`
- `GET /api/v1/site?siteId=...`

### Product surfaces
1. Executive dashboard
2. Operational risk table with remediation
3. API integration for underwriting/security workflows

## 8. Commercial Model

Recommended pricing stack:
- Paid pilot report: fixed fee
- Annual platform subscription: base + usage
- Optional premium alerting and benchmarks tier

## 9. Build Priorities After V1

1. Authentication and tenant isolation
2. Observation ingestion API and moderation queue
3. Contributor reputation engine with anti-fraud controls
4. Scheduled alerting and workflow integrations
5. Contract-ready compliance pack and SOC 2 roadmap

## 10. Legacy App Migration Strategy

The original app stores high-value marker semantics in Firestore (`quality`, `provenance`, `lifecycle`, and event telemetry). Preserve these while modernizing architecture.

### Implemented migration path in this repo
- Legacy quality logic ported in `src/lib/legacy-model.ts`
- Transformation pipeline in `src/lib/legacy-migration.ts`
- Preview ingestion endpoint: `POST /api/v1/import/legacy-markers`
- Operator UI for upload and preview: `/migration`
- Tenant persistence layer with import history and trend endpoints
- Customer analytics console: `/customers`

### Why daily full mapping is not required
- Risk and confidence are decay-weighted over time.
- High-exposure zones are prioritized for refresh.
- Official/integrator feeds can continuously update critical regions.
- Low-volatility regions can be refreshed less often while remaining decision-ready.

## 11. Success Metrics

- Portfolio risk score lift
- Freshness score lift
- Confidence score lift
- Estimated exposure reduction
- Customer renewal and expansion rate
