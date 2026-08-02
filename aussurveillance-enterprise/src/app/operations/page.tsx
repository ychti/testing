import { AuditLogViewer } from "@/components/audit-log-viewer";
import { OperatorAuthPanel } from "@/components/operator-auth-panel";

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
      <AuditLogViewer />
    </div>
  );
}

