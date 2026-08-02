import { fetchFirestoreMarkers } from "@/lib/firestore-markers";
import { migrateLegacyMarkersToPortfolio } from "@/lib/legacy-migration";
import { getPortfolioSummary } from "@/lib/security-intelligence";

interface SourceOptions {
  source: "mock" | "firestore";
  limit: number;
  updatedAfter?: string;
}

export interface PortfolioFetchResult {
  summary: ReturnType<typeof getPortfolioSummary>;
  ingestion?: {
    markersReceived: number;
    markersAccepted: number;
    invalidMarkers: number;
    generatedSites: number;
    generatedObservations: number;
  };
  warnings: string[];
  source: "mock" | "firestore";
}

export async function fetchPortfolioData({
  source,
  limit,
  updatedAfter,
}: SourceOptions): Promise<PortfolioFetchResult> {
  if (source === "mock") {
    return {
      summary: getPortfolioSummary(),
      source: "mock",
      warnings: [],
    };
  }

  const fetched = await fetchFirestoreMarkers({ limit, updatedAfter });
  const migration = migrateLegacyMarkersToPortfolio(fetched.markers);
  const warnings = [...migration.warnings];
  if (fetched.invalidRows > 0) {
    warnings.push(
      `${fetched.invalidRows} Firestore rows could not be normalized and were skipped.`,
    );
  }

  return {
    summary: migration.summary as ReturnType<typeof getPortfolioSummary>,
    source: "firestore",
    ingestion: migration.ingestion,
    warnings,
  };
}

