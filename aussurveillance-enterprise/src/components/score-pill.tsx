import type { SiteScore } from "@/lib/security-intelligence";

const tierClasses: Record<SiteScore["riskTier"], string> = {
  low: "bg-emerald-400/20 text-emerald-200 border-emerald-300/30",
  moderate: "bg-lime-400/20 text-lime-200 border-lime-300/30",
  elevated: "bg-amber-400/20 text-amber-100 border-amber-300/35",
  critical: "bg-rose-500/20 text-rose-100 border-rose-300/35",
};

export function ScorePill({
  value,
  tier,
}: {
  value: number;
  tier: SiteScore["riskTier"];
}) {
  return (
    <span
      className={`inline-flex min-w-16 items-center justify-center rounded-full border px-3 py-1 text-sm font-semibold ${tierClasses[tier]}`}
    >
      {value}
    </span>
  );
}
