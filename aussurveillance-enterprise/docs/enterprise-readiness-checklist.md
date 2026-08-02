# Enterprise Readiness Checklist

Use this checklist before selling high-value pilots and annual contracts.

## Security and Access

- [ ] Production admin credentials are configured (no defaults).
- [ ] Session secret is strong and rotated.
- [ ] API keys are scoped per tenant and use least privilege.
- [ ] Public convenience toggles are disabled in production.
- [ ] High-cost endpoints are protected with rate limits.

## Data and Platform Reliability

- [ ] Every import run is persisted to tenant history.
- [ ] Trend data can be generated from stored snapshots.
- [ ] Invalid rows are counted and surfaced in warning telemetry.
- [ ] Import failures are logged with actor and source metadata.
- [ ] Firestore admin credentials are managed through secure secret storage.

## Compliance and Governance

- [ ] Audit logging is enabled and retained centrally.
- [ ] Terms/privacy documents are reviewed by counsel.
- [ ] Sensitive-location and acceptable-use policies are published.
- [ ] Deletion and retention workflows are documented and testable.

## Commercial Delivery Readiness

- [ ] Pilot tenants can be created and isolated quickly.
- [ ] Latest snapshot and trend views are available per tenant.
- [ ] Import history demonstrates operational evidence for customers.
- [ ] KPI reporting includes risk, confidence, freshness, and exposure deltas.
