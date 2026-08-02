import { normalizeMarkerData } from "@/lib/marker-normalization";
import type { LegacyMarker } from "@/lib/legacy-model";

interface LiveFetchOptions {
  limit: number;
}

export interface LiveMarkerFetchResult {
  markers: LegacyMarker[];
  totalFetched: number;
  invalidRows: number;
  source: "live-public";
}

interface FirestoreDocumentResponse {
  documents?: Array<{
    name: string;
    fields?: Record<string, FirestoreValue>;
  }>;
  nextPageToken?: string;
}

type FirestoreValue = {
  nullValue?: null;
  booleanValue?: boolean;
  integerValue?: string;
  doubleValue?: number;
  timestampValue?: string;
  stringValue?: string;
  bytesValue?: string;
  referenceValue?: string;
  geoPointValue?: { latitude: number; longitude: number };
  arrayValue?: { values?: FirestoreValue[] };
  mapValue?: { fields?: Record<string, FirestoreValue> };
};

const DEFAULT_PUBLIC_API_KEY =
  process.env.PUBLIC_AUS_SURVEILLANCE_API_KEY ??
  "AIzaSyDNMA6SKABD7obW2c5-WiXXPiWsQg5kcKk";
const DEFAULT_PUBLIC_PROJECT_ID =
  process.env.PUBLIC_AUS_SURVEILLANCE_PROJECT_ID ?? "aus-surveillance";

function decodeFirestoreValue(value: FirestoreValue | undefined): unknown {
  if (!value) {
    return null;
  }
  if ("nullValue" in value) {
    return null;
  }
  if (value.booleanValue !== undefined) {
    return value.booleanValue;
  }
  if (value.integerValue !== undefined) {
    return Number(value.integerValue);
  }
  if (value.doubleValue !== undefined) {
    return value.doubleValue;
  }
  if (value.timestampValue !== undefined) {
    return value.timestampValue;
  }
  if (value.stringValue !== undefined) {
    return value.stringValue;
  }
  if (value.bytesValue !== undefined) {
    return value.bytesValue;
  }
  if (value.referenceValue !== undefined) {
    return value.referenceValue;
  }
  if (value.geoPointValue !== undefined) {
    return {
      lat: value.geoPointValue.latitude,
      lng: value.geoPointValue.longitude,
    };
  }
  if (value.arrayValue !== undefined) {
    const values = value.arrayValue.values ?? [];
    return values.map((item) => decodeFirestoreValue(item));
  }
  if (value.mapValue !== undefined) {
    const fields = value.mapValue.fields ?? {};
    const output: Record<string, unknown> = {};
    for (const [key, fieldValue] of Object.entries(fields)) {
      output[key] = decodeFirestoreValue(fieldValue);
    }
    return output;
  }
  return null;
}

function decodeFirestoreFields(fields: Record<string, FirestoreValue>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    output[key] = decodeFirestoreValue(value);
  }
  return output;
}

async function getAnonymousIdToken(apiKey: string): Promise<string> {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ returnSecureToken: true }),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Anonymous auth failed (${response.status}). ${text.slice(0, 220)}`,
    );
  }

  const payload = (await response.json()) as { idToken?: string };
  if (!payload.idToken) {
    throw new Error("Anonymous auth did not return idToken.");
  }
  return payload.idToken;
}

function docIdFromName(name: string): string {
  const pieces = name.split("/");
  return pieces[pieces.length - 1] ?? name;
}

export async function fetchLivePublicMarkers({
  limit,
}: LiveFetchOptions): Promise<LiveMarkerFetchResult> {
  const apiKey = DEFAULT_PUBLIC_API_KEY;
  const projectId = DEFAULT_PUBLIC_PROJECT_ID;
  const idToken = await getAnonymousIdToken(apiKey);

  const pageSize = Math.min(Math.max(limit, 1), 1000);
  let remaining = Math.min(Math.max(limit, 1), 50_000);
  let pageToken: string | undefined;
  const markers: LegacyMarker[] = [];
  let invalidRows = 0;
  let totalFetched = 0;

  while (remaining > 0) {
    const thisPageSize = Math.min(pageSize, remaining);
    const params = new URLSearchParams({
      pageSize: String(thisPageSize),
    });
    if (pageToken) {
      params.set("pageToken", pageToken);
    }

    const response = await fetch(
      `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
        projectId,
      )}/databases/(default)/documents/markers?${params.toString()}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
        cache: "no-store",
      },
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Firestore read failed (${response.status}). ${text.slice(0, 280)}`,
      );
    }

    const payload = (await response.json()) as FirestoreDocumentResponse;
    const docs = payload.documents ?? [];
    if (docs.length === 0) {
      break;
    }

    for (const doc of docs) {
      const fields = doc.fields ?? {};
      const decoded = decodeFirestoreFields(fields);
      const normalized = normalizeMarkerData(docIdFromName(doc.name), decoded);
      totalFetched += 1;
      if (!normalized) {
        invalidRows += 1;
        continue;
      }
      markers.push(normalized);
      remaining -= 1;
      if (remaining <= 0) {
        break;
      }
    }

    if (!payload.nextPageToken || remaining <= 0) {
      break;
    }
    pageToken = payload.nextPageToken;
  }

  return {
    source: "live-public",
    markers,
    totalFetched,
    invalidRows,
  };
}

