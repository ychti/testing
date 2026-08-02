import { LegacyImportConsole } from "@/components/legacy-import-console";
import { OperatorAuthPanel } from "@/components/operator-auth-panel";
import Link from "next/link";

const checklist = [
  "For quickest start, skip login and click 'Import Live Data Now'.",
  "Click 'Import Live Data Now' for the easiest one-click pipeline.",
  "Export markers from Firestore with id, coordinates, source, quality, lifecycle, and timestamps.",
  "Run payload through /api/v1/import/legacy-markers or pull directly with /api/v1/import/firestore-markers.",
  "Inspect generated site portfolio risk and identify degraded confidence/freshness zones.",
  "Promote accepted observations into tenant-scoped production collections.",
  "Enable scheduled refresh tasks and confidence decay recomputation jobs.",
];

export default function MigrationPage() {
  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <p className="text-xs uppercase tracking-[0.18em] text-cyan-200">
          Legacy modernization
        </p>
        <h1 className="text-4xl font-semibold text-white">
          From monolithic map app to enterprise intelligence platform
        </h1>
        <p className="max-w-3xl text-slate-300">
          This migration flow preserves your existing marker confidence and
          provenance semantics while converting data into an insurer-ready risk
          intelligence model.
        </p>
        <p className="text-sm text-slate-400">
          After importing, review saved history and trends in{" "}
          <Link
            href="/customers"
            className="font-semibold text-cyan-200 underline-offset-2 hover:underline"
          >
            Customer Intelligence
          </Link>
          .
        </p>
      </section>

      <section className="rounded-2xl border border-white/10 bg-slate-900/65 p-6">
        <h2 className="text-2xl font-semibold text-white">Migration sequence</h2>
        <ol className="mt-4 space-y-3 text-sm text-slate-300">
          {checklist.map((item, index) => (
            <li key={item} className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
              <span className="font-semibold text-white">{index + 1}.</span> {item}
            </li>
          ))}
        </ol>
      </section>

      <OperatorAuthPanel />
      <LegacyImportConsole />
    </div>
  );
}
