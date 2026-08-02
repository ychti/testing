# Legacy Migration Playbook (aus-surveillance -> enterprise intelligence)

This guide converts the current monolithic PWA marker schema into the enterprise risk intelligence schema used by this app.

## 1) Export legacy data

Export Firestore `markers` data including:
- `id`
- `lat`, `lng`
- `type`
- `source`, `verified`
- `userId`, `notes`
- `cctvMode`, `direction`
- `createdAt`, `updatedAt`
- `quality`, `provenance`, `lifecycle`

The import API accepts:
- raw array: `[ {marker...}, ... ]`
- wrapped object: `{ "items": [ ... ] }`
- wrapped object: `{ "markers": [ ... ] }`

## 2) Preview import with enterprise API

```bash
curl -X POST http://localhost:3000/api/v1/import/legacy-markers \
  -H "authorization: Bearer <api-key>" \
  -H "content-type: application/json" \
  -d @markers-export.json
```

Or use the web operator flow at `/migration`.

### Direct Firestore pipeline

If server credentials are configured, trigger server-side import:

```bash
curl -X POST http://localhost:3000/api/v1/import/firestore-markers \
  -H "authorization: Bearer <api-key>" \
  -H "content-type: application/json" \
  -d '{"limit":10000}'
```

### One-click live pull (no file export)

```bash
curl -X POST http://localhost:3000/api/v1/import/live-aus-surveillance \
  -H "authorization: Bearer <api-key>" \
  -H "content-type: application/json" \
  -d '{"limit":10000}'
```

## 3) Validate conversion output

The response includes:
- portfolio summary
- site-level risk rankings
- ingestion stats (accepted/invalid counts)
- warnings for low-volume or malformed datasets

## 4) Promote to production-grade ingestion

For full production rollout, add:
1. Tenant-authenticated ingestion endpoint.
2. Background ingestion jobs and dead-letter queue.
3. Data lineage tracking per import batch.
4. Scheduled freshness decay recomputation.
5. Alert workflows for confidence drop and blind-spot growth.

## 5) Preserve proven legacy semantics

These are directly ported:
- marker confidence score logic
- confidence band thresholds
- quality signal fields

Implemented in `src/lib/legacy-model.ts`.

## 6) Key operational principle

Do **not** attempt daily full remapping of all regions.  
Instead, run priority refresh on:
- high-exposure sites
- low-confidence zones
- high-volatility areas

This produces better economics and stronger enterprise-grade signal quality.
