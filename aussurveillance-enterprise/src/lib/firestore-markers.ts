import type { DocumentData } from "firebase-admin/firestore";
import { getFirestoreAdmin } from "@/lib/firebase-admin";
import type { LegacyMarker } from "@/lib/legacy-model";

interface FetchFirestoreMarkerOptions {
  limit: number;
  updatedAfter?: string;
}

export interface FirestoreMarkerFetchResult {
  markers: LegacyMarker[];
  totalFetched: number;
  invalidRows: number;
  source: "firestore";
}

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

function normalizeMarkerDoc(id: string, data: DocumentData): LegacyMarker | null {
  const lat =
    toNumber(data.lat) ??
    toNumber(data.latitude) ??
    toNumber(data.location?.lat) ??
    toNumber(data.location?.latitude) ??
    toNumber(data.geo?.lat) ??
    toNumber(data.geo?.latitude);
  const lng =
    toNumber(data.lng) ??
    toNumber(data.longitude) ??
    toNumber(data.location?.lng) ??
    toNumber(data.location?.longitude) ??
    toNumber(data.geo?.lng) ??
    toNumber(data.geo?.longitude);

  if (lat === null || lng === null || typeof data.type !== "string") {
    return null;
  }

  return {
    id,
    lat,
    lng,
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
    quality:
      data.quality && typeof data.quality === "object"
        ? {
            confidenceScore: toNumber(data.quality.confidenceScore),
            confidenceBand:
              data.quality.confidenceBand === "low" ||
              data.quality.confidenceBand === "medium" ||
              data.quality.confidenceBand === "high"
                ? data.quality.confidenceBand
                : null,
            qualityVersion: toNumber(data.quality.qualityVersion),
          }
        : null,
    provenance:
      data.provenance && typeof data.provenance === "object"
        ? {
            captureMethod:
              typeof data.provenance.captureMethod === "string"
                ? data.provenance.captureMethod
                : null,
            appSurface:
              typeof data.provenance.appSurface === "string"
                ? data.provenance.appSurface
                : null,
            actorType:
              typeof data.provenance.actorType === "string"
                ? data.provenance.actorType
                : null,
          }
        : null,
  };
}

export async function fetchFirestoreMarkers({
  limit,
  updatedAfter,
}: FetchFirestoreMarkerOptions): Promise<FirestoreMarkerFetchResult> {
  const db = getFirestoreAdmin();
  let query = db.collection("markers").limit(limit);

  if (updatedAfter) {
    query = query.where("updatedAt", ">=", updatedAfter);
  }

  const snapshot = await query.get();
  const markers: LegacyMarker[] = [];
  let invalidRows = 0;

  for (const doc of snapshot.docs) {
    const normalized = normalizeMarkerDoc(doc.id, doc.data());
    if (!normalized) {
      invalidRows += 1;
      continue;
    }
    markers.push(normalized);
  }

  return {
    markers,
    totalFetched: snapshot.size,
    invalidRows,
    source: "firestore",
  };
}

