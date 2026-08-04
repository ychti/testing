import { fetchFirestoreMarkers } from "@/lib/firestore-markers";
import { migrateLegacyMarkersToPortfolio } from "@/lib/legacy-migration";
import { getPortfolioSummary } from "@/lib/security-intelligence";
import {
  getLatestImportRun,
  listTenantAssets,
  resolveTenantId,
} from "@/lib/tenant-store";
import type { PortfolioSummary } from "@/lib/scoring-engine";

interface SourceOptions {
  source: "mock" | "firestore" | "snapshot";
  limit: number;
  updatedAfter?: string;
  tenantId?: string;
}

export interface PortfolioFetchResult {
  summary: PortfolioSummary;
  ingestion?: {
    markersReceived: number;
    markersAccepted: number;
    invalidMarkers: number;
    generatedSites: number;
    generatedObservations: number;
  };
  warnings: string[];
  source: "mock" | "firestore" | "snapshot";
  tenantId?: string;
  runId?: string;
  importedAt?: string;
}

export async function fetchPortfolioData({
  source,
  limit,
  updatedAfter,
  tenantId,
}: SourceOptions): Promise<PortfolioFetchResult> {
  if (tenantId && source !== "firestore") {
    const latest = await getLatestImportRun(tenantId);
    if (latest) {
      return {
        summary: latest.summary,
        source: "snapshot",
        warnings: latest.warnings,
        ingestion: latest.ingestion,
        tenantId,
        runId: latest.id,
        importedAt: latest.createdAt,
      };
    }
    if (source === "snapshot") {
      return {
        summary: getPortfolioSummary() as PortfolioSummary,
        source: "mock",
        warnings: [`No snapshot found for tenant ${tenantId}; showing mock data.`],
      };
    }
  }

  if (source === "mock") {
    return {
      summary: getPortfolioSummary() as PortfolioSummary,
      source: "mock",
      warnings: [],
    };
  }

  const fetched = await fetchFirestoreMarkers({ limit, updatedAfter });
  const resolvedTenantId = tenantId ? await resolveTenantId(tenantId) : undefined;
  const tenantAssets = resolvedTenantId
    ? await listTenantAssets(resolvedTenantId)
    : [];
  const migration = migrateLegacyMarkersToPortfolio(fetched.markers, {
    assets: tenantAssets,
  });
  const warnings = [...migration.warnings];
  if (fetched.invalidRows > 0) {
    warnings.push(
      `${fetched.invalidRows} Firestore rows could not be normalized and were skipped.`,
    );
  }

  return {
    summary: migration.summary,
    source: "firestore",
    ingestion: migration.ingestion,
    warnings,
    tenantId: resolvedTenantId,
  };
}

