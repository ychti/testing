# Integrating this platform with `aus-surveillance`

This repository contains the enterprise layer in a standalone Next.js app.
Use this checklist to align it with the production `aus-surveillance` project.

## 1) Keep consumer and enterprise surfaces separate

- Keep the current PWA map product unchanged for public/community use.
- Host this enterprise app on a separate subdomain, e.g. `intel.aussurveillance.com`.

## 2) Data flow bridge

Use one of two pipelines:

1. **File import path**
   - Export markers to JSON from Firestore.
   - Upload in `/migration`.

2. **Direct Firestore path**
   - Configure `FIREBASE_SERVICE_ACCOUNT_JSON`.
   - Trigger `POST /api/v1/import/firestore-markers`.

## 3) Security setup before external pilots

- Set strong `ENTERPRISE_SESSION_SECRET`.
- Set non-default operator credentials.
- Configure scoped `ENTERPRISE_API_KEYS_JSON`.
- Keep audit logs enabled (`/api/v1/audit` + `ENTERPRISE_AUDIT_LOG_PATH`).

## 4) Production rollout milestones

1. Add tenant persistence for imported portfolio snapshots.
2. Add ingestion queue with retry/dead-letter handling.
3. Add per-tenant access controls in every API endpoint.
4. Add legal terms and DPA references to onboarding.
5. Add scheduled freshness recompute jobs.

## 5) Contract-ready pilot package

For first insurer/integrator design partners:
- include methodology page screenshots
- include trust page controls
- include migration stats and high-risk site output
- include audit log sample exports as evidence of governance
