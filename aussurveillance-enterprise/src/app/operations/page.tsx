import { AuditLogViewer } from "@/components/audit-log-viewer";
import { OperatorAuthPanel } from "@/components/operator-auth-panel";
import Link from "next/link";

export default function OperationsPage() {
  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <p className="text-xs uppercase tracking-[0.18em] text-cyan-200">
          Operations and security
        </p>
        <h1 className="text-4xl font-semibold text-white">Enterprise control plane</h1>
        <p className="max-w-3xl text-slate-300">
          Authenticate as an operator, validate access scopes, inspect request
          audit logs, and monitor ingestion actions.
        </p>
      </section>
      <OperatorAuthPanel />
      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-2xl border border-white/10 bg-slate-900/65 p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
            Security controls
          </p>
          <p className="mt-2 text-sm text-slate-200">
            Scoped API auth, session auth, rate limits, and request audit logging
            are enabled.
          </p>
        </article>
        <article className="rounded-2xl border border-white/10 bg-slate-900/65 p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
            Data governance
          </p>
          <p className="mt-2 text-sm text-slate-200">
            Import runs are persisted per tenant with warnings and ingestion stats
            for compliance traceability.
          </p>
        </article>
        <article className="rounded-2xl border border-white/10 bg-slate-900/65 p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
            Deployment readiness
          </p>
          <p className="mt-2 text-sm text-slate-200">
            Follow the{" "}
            <Link
              href="/trust"
              className="font-semibold text-cyan-200 underline-offset-2 hover:underline"
            >
              trust center
            </Link>{" "}
            and checklist docs before production launch.
          </p>
        </article>
      </section>
      <AuditLogViewer />
    </div>
  );
}

