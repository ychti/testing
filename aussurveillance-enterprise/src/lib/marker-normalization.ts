import type { DocumentData } from "firebase-admin/firestore";
import type { LegacyMarker } from "@/lib/legacy-model";

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function toIsoTimestamp(value: unknown): string | null {
  if (!value) {
    return null;
  }
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as { toDate: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}

export function normalizeMarkerData(
  id: string,
  data: DocumentData | Record<string, unknown>,
): LegacyMarker | null {
  const lat = toNumber(data.lat) ?? toNumber(data.latitude);
  const lng = toNumber(data.lng) ?? toNumber(data.longitude);

  const location =
    data.location && typeof data.location === "object"
      ? (data.location as Record<string, unknown>)
      : {};
  const geo =
    data.geo && typeof data.geo === "object"
      ? (data.geo as Record<string, unknown>)
      : {};

  const resolvedLat =
    lat ??
    toNumber(location.lat) ??
    toNumber(location.latitude) ??
    toNumber(geo.lat) ??
    toNumber(geo.latitude);
  const resolvedLng =
    lng ??
    toNumber(location.lng) ??
    toNumber(location.longitude) ??
    toNumber(geo.lng) ??
    toNumber(geo.longitude);

  if (resolvedLat === null || resolvedLng === null || typeof data.type !== "string") {
    return null;
  }

  const quality =
    data.quality && typeof data.quality === "object"
      ? (data.quality as Record<string, unknown>)
      : null;
  const provenance =
    data.provenance && typeof data.provenance === "object"
      ? (data.provenance as Record<string, unknown>)
      : null;

  return {
    id,
    lat: resolvedLat,
    lng: resolvedLng,
    type: data.type,
    source: typeof data.source === "string" ? data.source : "user",
    verified: Boolean(data.verified),
    userId: typeof data.userId === "string" ? data.userId : null,
    notes: typeof data.notes === "string" ? data.notes : null,
    cctvMode:
      data.cctvMode === "directional" || data.cctvMode === "dome360"
        ? data.cctvMode
        : null,
    direction: toNumber(data.direction),
    createdAt: toIsoTimestamp(data.createdAt) ?? toIsoTimestamp(data.createdAtServer),
    updatedAt: toIsoTimestamp(data.updatedAt) ?? toIsoTimestamp(data.updatedAtServer),
    quality: quality
      ? {
          confidenceScore: toNumber(quality.confidenceScore),
          confidenceBand:
            quality.confidenceBand === "low" ||
            quality.confidenceBand === "medium" ||
            quality.confidenceBand === "high"
              ? quality.confidenceBand
              : null,
          qualityVersion: toNumber(quality.qualityVersion),
        }
      : null,
    provenance: provenance
      ? {
          captureMethod:
            typeof provenance.captureMethod === "string"
              ? provenance.captureMethod
              : null,
          appSurface:
            typeof provenance.appSurface === "string"
              ? provenance.appSurface
              : null,
          actorType:
            typeof provenance.actorType === "string" ? provenance.actorType : null,
        }
      : null,
  };
}

