export type LegacyMarkerSource = "user" | "official" | "imported-official" | string;

export type LegacyMarkerType =
  | "cctv"
  | "speed"
  | "redlight"
  | "alpr"
  | "combined"
  | "police"
  | "policeroad"
  | "accident"
  | "roadworks"
  | "hazard"
  | "other"
  | string;

export interface LegacyMarker {
  id?: string;
  lat: number;
  lng: number;
  type: LegacyMarkerType;
  source?: LegacyMarkerSource;
  verified?: boolean;
  userId?: string | null;
  notes?: string | null;
  cctvMode?: "directional" | "dome360" | null;
  direction?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  quality?: {
    confidenceScore?: number | null;
    confidenceBand?: "low" | "medium" | "high" | null;
    qualityVersion?: number | null;
  } | null;
  provenance?: {
    captureMethod?: string | null;
    appSurface?: string | null;
    actorType?: "authenticated" | "guest" | string | null;
  } | null;
}

export type MarkerConfidenceBand = "low" | "medium" | "high";

export interface MarkerQuality {
  confidenceScore: number;
  confidenceBand: MarkerConfidenceBand;
  qualityVersion: number;
  signals: {
    source: string;
    hasNotes: boolean;
    hasDirection: boolean;
    contributorType: "authenticated" | "guest";
  };
}

export function markerConfidenceBand(score: number): MarkerConfidenceBand {
  if (score >= 85) {
    return "high";
  }
  if (score >= 65) {
    return "medium";
  }
  return "low";
}

export function computeLegacyMarkerConfidenceScore(marker: LegacyMarker): number {
  let score = 45;
  if (marker.source === "official") {
    score += 30;
  } else if (marker.source === "imported-official") {
    score += 22;
  } else {
    score += 8;
  }

  if (marker.verified) {
    score += 20;
  }

  if (marker.userId && marker.userId !== "guest-local") {
    score += 8;
  } else {
    score -= 5;
  }

  if (marker.notes && marker.notes.trim().length >= 8) {
    score += 4;
  }

  if (marker.type === "cctv") {
    score += 10;
    if (marker.cctvMode === "directional" && Number.isFinite(marker.direction)) {
      score += 8;
    }
    if (marker.cctvMode === "dome360") {
      score += 5;
    }
  }

  return Math.max(1, Math.min(99, Math.round(score)));
}

export function buildLegacyMarkerQuality(marker: LegacyMarker): MarkerQuality {
  const confidenceScore =
    marker.quality?.confidenceScore ?? computeLegacyMarkerConfidenceScore(marker);
  const contributorType =
    marker.userId && marker.userId !== "guest-local" ? "authenticated" : "guest";

  return {
    confidenceScore,
    confidenceBand: marker.quality?.confidenceBand ?? markerConfidenceBand(confidenceScore),
    qualityVersion: marker.quality?.qualityVersion ?? 1,
    signals: {
      source: marker.source ?? "user",
      hasNotes: Boolean(marker.notes && marker.notes.trim().length > 0),
      hasDirection: Number.isFinite(marker.direction),
      contributorType,
    },
  };
}

export function isValidLegacyMarker(marker: unknown): marker is LegacyMarker {
  if (!marker || typeof marker !== "object") {
    return false;
  }
  const candidate = marker as Record<string, unknown>;
  return (
    typeof candidate.lat === "number" &&
    Number.isFinite(candidate.lat) &&
    Math.abs(candidate.lat) <= 90 &&
    typeof candidate.lng === "number" &&
    Number.isFinite(candidate.lng) &&
    Math.abs(candidate.lng) <= 180 &&
    typeof candidate.type === "string"
  );
}
