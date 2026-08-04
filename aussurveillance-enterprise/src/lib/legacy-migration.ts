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
  coverage: {
    totalMarkersAfterNormalization: number;
    duplicateMarkersCollapsed: number;
    representedStateCount: number;
    nationalCoverageScore: number;
    assetsProvided?: number;
    markersMatchedToAssets?: number;
    unmatchedMarkers?: number;
    generatedAssetSites?: number;
    byState: Array<{
      state: string;
      markerCount: number;
      siteCount: number;
      avgConfidence: number;
    }>;
  };
  warnings: string[];
}

interface SiteAccumulator {
  site: ScoringSite;
  markers: LegacyMarker[];
  isAssetMapped: boolean;
  segmentLocked: boolean;
}

export interface MigrationAsset {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  region?: string;
  segment?: ScoringSite["segment"];
  insuredValueAud?: number;
}

interface MigrationOptions {
  assets?: MigrationAsset[];
  assetMatchRadiusKm?: number;
}

const CAMERA_TYPES = new Set(["cctv", "speed", "redlight", "alpr", "combined"]);
const KNOWN_STATES = ["NSW", "QLD", "VIC", "SA", "WA", "ACT", "NT", "TAS"];

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

function markerTimestamp(marker: LegacyMarker): number {
  const iso = marker.updatedAt ?? marker.createdAt;
  if (!iso) {
    return 0;
  }
  const parsed = new Date(iso).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function markerDedupKey(marker: LegacyMarker): string {
  const lat = Math.round(marker.lat * 10_000) / 10_000;
  const lng = Math.round(marker.lng * 10_000) / 10_000;
  const directionBucket = Number.isFinite(marker.direction)
    ? Math.round((marker.direction ?? 0) / 15) * 15
    : "na";
  return [
    marker.type,
    marker.source ?? "user",
    marker.cctvMode ?? "none",
    directionBucket,
    lat.toFixed(4),
    lng.toFixed(4),
  ].join("|");
}

function siteLabel(region: string, latCell: number, lngCell: number): string {
  return `${region} grid (${latCell.toFixed(2)}, ${lngCell.toFixed(2)})`;
}

function mapInsuredValue(markerCount: number, region: string): number {
  const regionMultiplier =
    region === "NSW" || region === "VIC" ? 1.25 : region === "WA" || region === "QLD" ? 1.1 : 0.9;
  return Math.round((1_900_000 + markerCount * 120_000) * regionMultiplier);
}

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const degToRad = Math.PI / 180;
  const dLat = (bLat - aLat) * degToRad;
  const dLng = (bLng - aLng) * degToRad;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const aa =
    sinLat * sinLat +
    Math.cos(aLat * degToRad) * Math.cos(bLat * degToRad) * sinLng * sinLng;
  const c = 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
  return 6371 * c;
}

function findNearestAsset(
  marker: LegacyMarker,
  assets: MigrationAsset[],
  maxRadiusKm: number,
): MigrationAsset | null {
  let nearest: MigrationAsset | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const asset of assets) {
    const distance = haversineKm(marker.lat, marker.lng, asset.lat, asset.lng);
    if (distance > maxRadiusKm || distance >= nearestDistance) {
      continue;
    }
    nearest = asset;
    nearestDistance = distance;
  }
  return nearest;
}

function assetLabel(asset: MigrationAsset): string {
  const cleanedAddress = asset.address.trim();
  if (!cleanedAddress) {
    return asset.name;
  }
  return `${asset.name} — ${cleanedAddress}`;
}

function assetSiteId(asset: MigrationAsset): string {
  return asset.id.startsWith("asset-") ? asset.id : `asset-${asset.id}`;
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
  options: MigrationOptions = {},
): LegacyMigrationResult {
  const warnings: string[] = [];
  const accepted: LegacyMarker[] = [];
  const dedupedByKey = new Map<string, LegacyMarker>();
  let invalidMarkers = 0;
  let duplicateMarkersCollapsed = 0;
  const assets = (options.assets ?? []).filter((asset) => {
    return (
      typeof asset.name === "string" &&
      asset.name.trim().length > 0 &&
      Number.isFinite(asset.lat) &&
      Number.isFinite(asset.lng)
    );
  });
  const assetMatchRadiusKm = Math.min(
    Math.max(options.assetMatchRadiusKm ?? 1.2, 0.2),
    5,
  );
  let markersMatchedToAssets = 0;

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
    const key = markerDedupKey(marker);
    const existing = dedupedByKey.get(key);
    if (!existing) {
      dedupedByKey.set(key, marker);
      continue;
    }
    duplicateMarkersCollapsed += 1;
    const existingScore = buildLegacyMarkerQuality(existing).confidenceScore;
    const nextScore = buildLegacyMarkerQuality(marker).confidenceScore;
    const existingTimestamp = markerTimestamp(existing);
    const nextTimestamp = markerTimestamp(marker);
    if (
      nextScore > existingScore ||
      (nextScore === existingScore && nextTimestamp > existingTimestamp)
    ) {
      dedupedByKey.set(key, marker);
    }
  }
  const normalizedMarkers = Array.from(dedupedByKey.values());

  const accumulators = new Map<string, SiteAccumulator>();
  const stateConfidence = new Map<string, { total: number; count: number }>();
  const stateMarkerCount = new Map<string, number>();
  for (const marker of normalizedMarkers) {
    const markerRegion = inferRegion(marker.lat, marker.lng);
    const latCell = roundToCell(marker.lat);
    const lngCell = roundToCell(marker.lng);
    const nearestAsset =
      assets.length > 0
        ? findNearestAsset(marker, assets, assetMatchRadiusKm)
        : null;
    const region = nearestAsset?.region?.trim() || markerRegion;
    stateMarkerCount.set(region, (stateMarkerCount.get(region) ?? 0) + 1);
    const confidence = buildLegacyMarkerQuality(marker).confidenceScore;
    const confidenceBucket = stateConfidence.get(region) ?? { total: 0, count: 0 };
    confidenceBucket.total += confidence;
    confidenceBucket.count += 1;
    stateConfidence.set(region, confidenceBucket);
    const siteId = nearestAsset
      ? assetSiteId(nearestAsset)
      : `${region.toLowerCase()}-${latCell.toFixed(2)}-${lngCell.toFixed(2)}`;
    const existing = accumulators.get(siteId);
    if (existing) {
      existing.markers.push(marker);
      if (nearestAsset) {
        markersMatchedToAssets += 1;
      }
      continue;
    }
    const markerTypes = new Set([marker.type]);
    const site: ScoringSite = {
      id: siteId,
      name: nearestAsset ? assetLabel(nearestAsset) : siteLabel(region, latCell, lngCell),
      segment: nearestAsset?.segment ?? inferSegment(markerTypes),
      region,
      insuredValueAud: nearestAsset?.insuredValueAud ?? 0,
    };
    accumulators.set(siteId, {
      site,
      markers: [marker],
      isAssetMapped: Boolean(nearestAsset),
      segmentLocked: Boolean(nearestAsset?.segment),
    });
    if (nearestAsset) {
      markersMatchedToAssets += 1;
    }
  }

  const sites: ScoringSite[] = [];
  const observations: ScoringObservation[] = [];
  const stateSiteSet = new Map<string, Set<string>>();

  for (const [, accumulator] of accumulators) {
    const markerTypes = new Set(accumulator.markers.map((marker) => marker.type));
    if (!accumulator.segmentLocked) {
      accumulator.site.segment = inferSegment(markerTypes);
    }
    if (!accumulator.site.insuredValueAud || accumulator.site.insuredValueAud <= 0) {
      accumulator.site.insuredValueAud = mapInsuredValue(
        accumulator.markers.length,
        accumulator.site.region,
      );
    }
    sites.push(accumulator.site);
    const siteSet = stateSiteSet.get(accumulator.site.region) ?? new Set<string>();
    siteSet.add(accumulator.site.id);
    stateSiteSet.set(accumulator.site.region, siteSet);
    observations.push(buildObservationForSite(accumulator.site.id, accumulator.markers));
  }

  if (sites.length === 0) {
    warnings.push("No valid markers were provided. Falling back to empty portfolio.");
  }
  if (invalidMarkers > 0) {
    warnings.push(`${invalidMarkers} marker rows were invalid and skipped.`);
  }
  if (normalizedMarkers.length > 0 && normalizedMarkers.length < 250) {
    warnings.push(
      "Portfolio preview is based on fewer than 250 markers; confidence may be unstable.",
    );
  }
  if (duplicateMarkersCollapsed > 0) {
    const ratio = duplicateMarkersCollapsed / Math.max(accepted.length, 1);
    if (ratio > 0.2) {
      warnings.push(
        "High duplicate density detected in import feed; verify upstream deduplication quality.",
      );
    }
  }
  if (assets.length > 0) {
    const matchedRatio = markersMatchedToAssets / Math.max(normalizedMarkers.length, 1);
    if (matchedRatio < 0.6) {
      warnings.push(
        "Large share of markers could not be attached to uploaded assets. Check asset coordinates or increase portfolio coverage.",
      );
    }
  }

  const byState = Array.from(stateMarkerCount.entries())
    .map(([state, markerCount]) => {
      const confidence = stateConfidence.get(state);
      const avgConfidence =
        confidence && confidence.count > 0
          ? Math.round(confidence.total / confidence.count)
          : 0;
      return {
        state,
        markerCount,
        siteCount: stateSiteSet.get(state)?.size ?? 0,
        avgConfidence,
      };
    })
    .sort((a, b) => b.markerCount - a.markerCount);

  const representedStates = KNOWN_STATES.filter((state) =>
    byState.some((row) => row.state === state && row.markerCount > 0),
  );
  if (representedStates.length < 5) {
    warnings.push(
      "National coverage is currently sparse across states; increase multi-state imports for insurer-grade viability.",
    );
  }
  const globalConfidence =
    byState.length > 0
      ? byState.reduce((sum, row) => sum + row.avgConfidence * row.markerCount, 0) /
        byState.reduce((sum, row) => sum + row.markerCount, 0)
      : 0;
  const distributionScore = representedStates.length / KNOWN_STATES.length;
  const depthScore = clamp(normalizedMarkers.length / 75_000);
  const qualityScore = clamp(globalConfidence / 100);
  const nationalCoverageScore = Math.round(
    (distributionScore * 0.45 + depthScore * 0.35 + qualityScore * 0.2) * 100,
  );

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
      markersAccepted: normalizedMarkers.length,
      invalidMarkers,
      generatedSites: sites.length,
      generatedObservations: observations.length,
    },
    coverage: {
      totalMarkersAfterNormalization: normalizedMarkers.length,
      duplicateMarkersCollapsed,
      representedStateCount: representedStates.length,
      nationalCoverageScore,
      assetsProvided: assets.length,
      markersMatchedToAssets,
      unmatchedMarkers: Math.max(normalizedMarkers.length - markersMatchedToAssets, 0),
      generatedAssetSites: sites.filter((site) => site.id.startsWith("asset-")).length,
      byState,
    },
    warnings,
  };
}
