const stages = [
  {
    title: "Ingestion and rights tagging",
    detail:
      "Observations are recorded with source type, timestamp, provenance metadata, and contributor rights lineage.",
  },
  {
    title: "Freshness and confidence weighting",
    detail:
      "Each signal is decay-weighted by environmental volatility and trust-weighted by verifier quality and contributor reputation.",
  },
  {
    title: "Coverage and blind-spot modelling",
    detail:
      "Coverage ratio, blind-spot ratio, lighting quality, and maintenance posture are combined into one normalized risk model.",
  },
  {
    title: "Portfolio exposure estimation",
    detail:
      "Site scores roll up into portfolio exposure estimates used by underwriting, risk, and operations teams.",
  },
];

export default function MethodologyPage() {
  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <p className="text-xs uppercase tracking-[0.18em] text-cyan-200">
          Methodology
        </p>
        <h1 className="text-4xl font-semibold text-white">
          How AUSSurveillance Intelligence computes risk
        </h1>
        <p className="max-w-3xl text-slate-300">
          The platform was designed for high-trust enterprise adoption: fully
          traceable inputs, explainable modelling, and repeatable score output.
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {stages.map((stage, index) => (
          <article
            key={stage.title}
            className="rounded-2xl border border-white/10 bg-slate-900/65 p-5"
          >
            <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
              Stage {index + 1}
            </p>
            <h2 className="mt-2 text-xl font-semibold text-white">{stage.title}</h2>
            <p className="mt-2 text-slate-300">{stage.detail}</p>
          </article>
        ))}
      </section>

      <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-6">
        <h2 className="text-2xl font-semibold text-white">Risk score formula</h2>
        <p className="mt-3 text-slate-300">
          The model balances camera coverage, blind spots, lighting, and
          maintenance in a weighted index.
        </p>
        <pre className="mt-4 overflow-auto rounded-xl border border-white/10 bg-slate-950 p-4 text-sm text-cyan-100">
          <code>
            {`combinedRisk =
  (1 - weightedCoverage) * 0.45 +
  weightedBlindSpots * 0.30 +
  (1 - weightedLighting) * 0.15 +
  (1 - weightedMaintenance) * 0.10

riskScore = round((1 - combinedRisk) * 100)`}
          </code>
        </pre>
        <p className="mt-4 text-sm text-slate-400">
          All weighted inputs include a freshness decay factor and source-trust
          multipliers to prevent stale or low-confidence observations from
          dominating output.
        </p>
      </section>
    </div>
  );
}
