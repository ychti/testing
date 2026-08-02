const controls = [
  {
    domain: "Data rights and provenance",
    controls: [
      "Contributor terms include explicit commercial usage license.",
      "Each observation stores source, timestamp, and rights lineage.",
      "Data minimization defaults prevent personal identifiers.",
    ],
  },
  {
    domain: "Security and access",
    controls: [
      "Role-based access model for insurer, operator, and auditor personas.",
      "API keys scoped by customer tenant and endpoint classes.",
      "Comprehensive audit logs for all read and write operations.",
    ],
  },
  {
    domain: "Safety and acceptable use",
    controls: [
      "Use policy prevents targeting, stalking, or evasion use cases.",
      "Sensitive location classes can be redacted from external payloads.",
      "Customer vetting required before enabling high-resolution exports.",
    ],
  },
];

export default function TrustPage() {
  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <p className="text-xs uppercase tracking-[0.18em] text-cyan-200">Trust</p>
        <h1 className="text-4xl font-semibold text-white">
          Enterprise trust, compliance, and governance
        </h1>
        <p className="max-w-3xl text-slate-300">
          Winning insurer and enterprise contracts requires demonstrable control
          over data rights, quality, and platform use. These controls are baked
          into product design rather than layered on later.
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {controls.map((domain) => (
          <article
            key={domain.domain}
            className="rounded-2xl border border-white/10 bg-slate-900/65 p-5"
          >
            <h2 className="text-lg font-semibold text-white">{domain.domain}</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-300">
              {domain.controls.map((control) => (
                <li key={control} className="flex gap-2">
                  <span className="mt-1 h-2 w-2 rounded-full bg-cyan-300" />
                  <span>{control}</span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </section>

      <section className="rounded-2xl border border-white/10 bg-slate-900/65 p-6">
        <h2 className="text-2xl font-semibold text-white">
          Compliance and legal readiness checklist
        </h2>
        <ol className="mt-4 grid gap-3 text-sm text-slate-300 md:grid-cols-2">
          <li className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
            1. Complete AU privacy and surveillance law review of contributor and
            customer terms.
          </li>
          <li className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
            2. Define retention and deletion policy per data class.
          </li>
          <li className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
            3. Publish data handling and acceptable-use policies in onboarding.
          </li>
          <li className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
            4. Implement annual independent controls review and penetration tests.
          </li>
        </ol>
      </section>
    </div>
  );
}
