import { CustomerIntelligenceConsole } from "@/components/customer-intelligence-console";

export default function CustomersPage() {
  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <p className="text-xs uppercase tracking-[0.18em] text-cyan-200">
          Customer intelligence
        </p>
        <h1 className="text-4xl font-semibold text-white">
          Enterprise portfolio reporting and trend analysis
        </h1>
        <p className="max-w-3xl text-slate-300">
          Analyze each customer workspace independently, inspect historical imports,
          and monitor how risk posture changes over time for executive reporting.
        </p>
      </section>
      <CustomerIntelligenceConsole />
    </div>
  );
}

