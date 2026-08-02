import {
  buildLegacyMarkerQuality,
  computeLegacyMarkerConfidenceScore,
  type LegacyMarker,
} from "@/lib/legacy-model";
import {
  buildPortfolioSummary,
  type ObservationSource,
  type PortfolioSummary,
  type ScoringObservation,
  type ScoringSite,
} from "@/lib/scoring-engine";

export interface LegacyMigrationResult {
  summary: PortfolioSummary;
  ingestion: {
    markersReceived: number;
    markersAccepted: number;
    invalidMarkers: number;
    generatedSites: number;
    generatedObservations: number;
  };
  warnings: string[];
}

interface SiteAccumulator {
  site: ScoringSite;
  markers: LegacyMarker[];
}

const CAMERA_TYPES = new Set(["cctv", "speed", "redlight", "alpr", "combined"]);

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function roundToCell(value: number): number {
  return Math.round(value * 20) / 20;
}

function inferRegion(lat: number, lng: number): string {
  if (lat >= -11.5 && lat <= -9.5 && lng >= 141 && lng <= 143.5) {
    return "QLD";
  }
  if (lat >= -29.5 && lat <= -10 && lng >= 137 && lng <= 153.8) {
    return "QLD";
  }
  if (lat >= -38.8 && lat <= -28.1 && lng >= 140.5 && lng <= 153.8) {
    return "NSW";
  }
  if (lat >= -39.3 && lat <= -33.8 && lng >= 140.6 && lng <= 150.2) {
    return "VIC";
  }
  if (lat >= -35.2 && lat <= -33.8 && lng >= 148.7 && lng <= 149.5) {
    return "ACT";
  }
  if (lat >= -38.2 && lat <= -25.8 && lng >= 129 && lng <= 141.2) {
    return "SA";
  }
  if (lat >= -35.2 && lat <= -13.5 && lng >= 112.5 && lng <= 129.5) {
    return "WA";
  }
  if (lat >= -26.2 && lat <= -10.8 && lng >= 129.5 && lng <= 138.2) {
    return "NT";
  }
  if (lat >= -43.9 && lat <= -39.1 && lng >= 143.6 && lng <= 149.2) {
    return "TAS";
  }
  return "AU";
}

function inferSegment(markerTypes: Set<string>): ScoringSite["segment"] {
  if (markerTypes.has("hospital") || markerTypes.has("medical")) {
    return "healthcare";
  }
  if (markerTypes.has("roadworks") || markerTypes.has("hazard")) {
    return "logistics";
  }
  if (markerTypes.has("police")) {
    return "education";
  }
  return "retail";
}

function markerSourceToObservationSource(
  marker: LegacyMarker | undefined,
): ObservationSource {
  if (!marker) {
    return "community";
  }
  if (marker.source === "official" || marker.source === "imported-official") {
    return "integrator";
  }
  if (marker.userId && marker.userId !== "guest-local") {
    return "customer-audit";
  }
  return "community";
}

function markerAgeDays(marker: LegacyMarker): number {
  const iso = marker.updatedAt ?? marker.createdAt;
  if (!iso) {
    return 30;
  }
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return 30;
  }
  const diffMs = Date.now() - parsed.getTime();
  return Math.max(diffMs / (1000 * 60 * 60 * 24), 0);
}

function siteLabel(region: string, latCell: number, lngCell: number): string {
  return `${region} grid (${latCell.toFixed(2)}, ${lngCell.toFixed(2)})`;
}

function mapInsuredValue(markerCount: number, region: string): number {
  const regionMultiplier =
    region === "NSW" || region === "VIC" ? 1.25 : region === "WA" || region === "QLD" ? 1.1 : 0.9;
  return Math.round((1_900_000 + markerCount * 120_000) * regionMultiplier);
}

function buildObservationForSite(
  siteId: string,
  markers: LegacyMarker[],
): ScoringObservation {
  const confidenceScores = markers.map((marker) => {
    const quality = buildLegacyMarkerQuality(marker);
    return clamp(quality.confidenceScore / 100);
  });
  const confidence =
    confidenceScores.reduce((sum, value) => sum + value, 0) /
    Math.max(confidenceScores.length, 1);

  const cameraMarkers = markers.filter((marker) => CAMERA_TYPES.has(marker.type));
  const cameraCount = cameraMarkers.length;
  const directional = cameraMarkers.filter(
    (marker) =>
      marker.type === "cctv" &&
      marker.cctvMode === "directional" &&
      Number.isFinite(marker.direction),
  ).length;
  const dome = cameraMarkers.filter(
    (marker) => marker.type === "cctv" && marker.cctvMode === "dome360",
  ).length;
  const verified = markers.filter((marker) => marker.verified).length;
  const official = markers.filter(
    (marker) => marker.source === "official" || marker.source === "imported-official",
  ).length;

  const avgAgeDays =
    markers.reduce((sum, marker) => sum + markerAgeDays(marker), 0) /
    Math.max(markers.length, 1);
  const recencyBoost = clamp(1 - avgAgeDays / 180);

  const coverageSeed =
    cameraCount * 0.042 +
    directional * 0.03 +
    dome * 0.02 +
    verified * 0.015 +
    official * 0.02;
  const coverageRatio = clamp(coverageSeed);

  const blindSpots = Math.max(
    1,
    Math.round(cameraCount * (1.08 - coverageRatio) + markers.length * 0.15),
  );

  const lightingScore = clamp(0.45 + confidence * 0.32 + recencyBoost * 0.23);
  const maintenanceScore = clamp(
    0.4 + confidence * 0.3 + clamp(official / Math.max(markers.length, 1)) * 0.3,
  );

  const topMarker = markers
    .slice()
    .sort(
      (a, b) =>
        computeLegacyMarkerConfidenceScore(b) - computeLegacyMarkerConfidenceScore(a),
    )[0];
  const source = markerSourceToObservationSource(topMarker ?? markers[0]);

  const observedAt = markers
    .map((marker) => marker.updatedAt ?? marker.createdAt)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];

  return {
    id: `obs-${siteId}`,
    siteId,
    observedAt: observedAt ?? new Date().toISOString(),
    source,
    cameraCount: Math.max(cameraCount, 1),
    blindSpots,
    coverageRatio,
    lightingScore,
    maintenanceScore,
    verifierConfidence: confidence,
    contributorReputation: clamp(0.5 + confidence * 0.45),
    volatility: clamp(0.2 + (1 - recencyBoost) * 0.8),
  };
}

export function migrateLegacyMarkersToPortfolio(
  rawMarkers: LegacyMarker[],
): LegacyMigrationResult {
  const warnings: string[] = [];
  const accepted: LegacyMarker[] = [];
  let invalidMarkers = 0;

  for (const marker of rawMarkers) {
    const isValidCoord =
      Number.isFinite(marker.lat) &&
      Number.isFinite(marker.lng) &&
      Math.abs(marker.lat) <= 90 &&
      Math.abs(marker.lng) <= 180;
    if (!isValidCoord || typeof marker.type !== "string") {
      invalidMarkers += 1;
      continue;
    }
    accepted.push(marker);
  }

  const accumulators = new Map<string, SiteAccumulator>();
  for (const marker of accepted) {
    const latCell = roundToCell(marker.lat);
    const lngCell = roundToCell(marker.lng);
    const region = inferRegion(marker.lat, marker.lng);
    const siteId = `${region.toLowerCase()}-${latCell.toFixed(2)}-${lngCell.toFixed(2)}`;
    const existing = accumulators.get(siteId);
    if (existing) {
      existing.markers.push(marker);
      continue;
    }
    const markerTypes = new Set([marker.type]);
    const site: ScoringSite = {
      id: siteId,
      name: siteLabel(region, latCell, lngCell),
      segment: inferSegment(markerTypes),
      region,
      insuredValueAud: 0,
    };
    accumulators.set(siteId, { site, markers: [marker] });
  }

  const sites: ScoringSite[] = [];
  const observations: ScoringObservation[] = [];

  for (const [, accumulator] of accumulators) {
    const markerTypes = new Set(accumulator.markers.map((marker) => marker.type));
    accumulator.site.segment = inferSegment(markerTypes);
    accumulator.site.insuredValueAud = mapInsuredValue(
      accumulator.markers.length,
      accumulator.site.region,
    );
    sites.push(accumulator.site);
    observations.push(buildObservationForSite(accumulator.site.id, accumulator.markers));
  }

  if (sites.length === 0) {
    warnings.push("No valid markers were provided. Falling back to empty portfolio.");
  }
  if (invalidMarkers > 0) {
    warnings.push(`${invalidMarkers} marker rows were invalid and skipped.`);
  }
  if (accepted.length > 0 && accepted.length < 250) {
    warnings.push(
      "Portfolio preview is based on fewer than 250 markers; confidence may be unstable.",
    );
  }

  const summary = buildPortfolioSummary(
    sites.length > 0
      ? sites
      : [
          {
            id: "fallback-site",
            name: "Fallback site",
            segment: "retail",
            region: "AU",
            insuredValueAud: 2_000_000,
          },
        ],
    observations.length > 0
      ? observations
      : [
          {
            id: "fallback-observation",
            siteId: "fallback-site",
            observedAt: new Date().toISOString(),
            source: "community",
            cameraCount: 1,
            blindSpots: 1,
            coverageRatio: 0.5,
            lightingScore: 0.5,
            maintenanceScore: 0.5,
            verifierConfidence: 0.5,
            contributorReputation: 0.5,
            volatility: 0.7,
          },
        ],
    new Date(),
  );

  return {
    summary,
    ingestion: {
      markersReceived: rawMarkers.length,
      markersAccepted: accepted.length,
      invalidMarkers,
      generatedSites: sites.length,
      generatedObservations: observations.length,
    },
    warnings,
  };
}
