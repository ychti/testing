import { formatCurrencyAud, formatDateTime } from "@/lib/format";
import type { SiteScore } from "@/lib/security-intelligence";
import { ScorePill } from "./score-pill";

export function SiteRiskTable({ rows }: { rows: SiteScore[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/65">
      <table className="min-w-full divide-y divide-white/10 text-left text-sm">
        <thead className="bg-slate-900/80 text-xs uppercase tracking-[0.15em] text-slate-400">
          <tr>
            <th className="px-4 py-3">Site</th>
            <th className="px-4 py-3">Risk score</th>
            <th className="px-4 py-3">Confidence</th>
            <th className="px-4 py-3">Freshness</th>
            <th className="px-4 py-3">Exposure / month</th>
            <th className="px-4 py-3">Last verified</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {rows.map((item) => (
            <tr key={item.site.id} className="text-slate-200">
              <td className="px-4 py-3">
                <p className="font-medium text-white">{item.site.name}</p>
                <p className="text-xs text-slate-400">
                  {item.site.segment} · {item.site.region}
                </p>
              </td>
              <td className="px-4 py-3">
                <ScorePill value={item.riskScore} tier={item.riskTier} />
              </td>
              <td className="px-4 py-3">{item.confidenceScore}</td>
              <td className="px-4 py-3">{item.freshnessScore}</td>
              <td className="px-4 py-3">
                {formatCurrencyAud(item.estimatedMonthlyExposureAud)}
              </td>
              <td className="px-4 py-3 text-slate-300">
                {formatDateTime(item.lastObservedAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
