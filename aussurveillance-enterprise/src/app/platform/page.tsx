import { LivePlatformOverview } from "@/components/live-platform-overview";
import { getPortfolioSummary } from "@/lib/security-intelligence";

export default function PlatformPage() {
  const summary = getPortfolioSummary();
  return <LivePlatformOverview fallbackSummary={summary} />;
}
