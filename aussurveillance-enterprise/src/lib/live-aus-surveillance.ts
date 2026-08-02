import { normalizeMarkerData } from "@/lib/marker-normalization";
import type { LegacyMarker } from "@/lib/legacy-model";

interface LiveFetchOptions {
  limit: number;
  firebaseEmail?: string;
  firebasePassword?: string;
}

export interface LiveMarkerFetchResult {
  markers: LegacyMarker[];
  totalFetched: number;
  invalidRows: number;
  source: "live-public";
  authMode: "public" | "anonymous" | "password";
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

function extractAuthErrorMessage(rawText: string): string {
  let message = rawText;
  try {
    const parsed = JSON.parse(rawText) as {
      error?: { message?: string };
    };
    if (parsed.error?.message) {
      message = parsed.error.message;
    }
  } catch {
    // Keep raw text if parsing fails.
  }
  return message;
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
    const message = extractAuthErrorMessage(text);
    throw new Error(`Anonymous auth failed (${response.status}). ${message}`);
  }

  const payload = (await response.json()) as { idToken?: string };
  if (!payload.idToken) {
    throw new Error("Anonymous auth did not return idToken.");
  }
  return payload.idToken;
}

async function getPasswordIdToken(
  apiKey: string,
  email: string,
  password: string,
): Promise<string> {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true,
      }),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const text = await response.text();
    const message = extractAuthErrorMessage(text);
    throw new Error(`Password auth failed (${response.status}). ${message}`);
  }

  const payload = (await response.json()) as { idToken?: string };
  if (!payload.idToken) {
    throw new Error("Password auth did not return idToken.");
  }
  return payload.idToken;
}

function docIdFromName(name: string): string {
  const pieces = name.split("/");
  return pieces[pieces.length - 1] ?? name;
}

async function fetchDocumentPage({
  projectId,
  apiKey,
  idToken,
  pageSize,
  pageToken,
}: {
  projectId: string;
  apiKey: string;
  idToken?: string;
  pageSize: number;
  pageToken?: string;
}): Promise<FirestoreDocumentResponse> {
  const params = new URLSearchParams({
    pageSize: String(pageSize),
    key: apiKey,
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
      headers: idToken ? { Authorization: `Bearer ${idToken}` } : undefined,
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const text = await response.text();
    const message = extractAuthErrorMessage(text);
    throw new Error(`Firestore read failed (${response.status}). ${message}`);
  }

  return (await response.json()) as FirestoreDocumentResponse;
}

async function collectMarkers({
  projectId,
  apiKey,
  idToken,
  limit,
}: {
  projectId: string;
  apiKey: string;
  idToken?: string;
  limit: number;
}): Promise<{
  markers: LegacyMarker[];
  totalFetched: number;
  invalidRows: number;
}> {
  const pageSize = Math.min(Math.max(limit, 1), 1000);
  let remaining = Math.min(Math.max(limit, 1), 50_000);
  let pageToken: string | undefined;
  const markers: LegacyMarker[] = [];
  let invalidRows = 0;
  let totalFetched = 0;

  while (remaining > 0) {
    const thisPageSize = Math.min(pageSize, remaining);
    const payload = await fetchDocumentPage({
      projectId,
      apiKey,
      idToken,
      pageSize: thisPageSize,
      pageToken,
    });
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

  return { markers, totalFetched, invalidRows };
}

export async function fetchLivePublicMarkers({
  limit,
  firebaseEmail,
  firebasePassword,
}: LiveFetchOptions): Promise<LiveMarkerFetchResult> {
  const apiKey = DEFAULT_PUBLIC_API_KEY;
  const projectId = DEFAULT_PUBLIC_PROJECT_ID;
  const fallbackEmail =
    firebaseEmail?.trim() || process.env.PUBLIC_AUS_SURVEILLANCE_EMAIL || "";
  const fallbackPassword =
    firebasePassword || process.env.PUBLIC_AUS_SURVEILLANCE_PASSWORD || "";
  let authMode: "public" | "anonymous" | "password" = "public";
  let collected:
    | {
        markers: LegacyMarker[];
        totalFetched: number;
        invalidRows: number;
      }
    | undefined;

  try {
    collected = await collectMarkers({
      projectId,
      apiKey,
      limit,
    });
    authMode = "public";
  } catch (publicError) {
    const publicMessage =
      publicError instanceof Error ? publicError.message : String(publicError);
    const publicDenied =
      publicMessage.includes("PERMISSION_DENIED") ||
      publicMessage.includes("UNAUTHENTICATED") ||
      publicMessage.includes("401") ||
      publicMessage.includes("403");
    if (!publicDenied) {
      throw publicError;
    }
  }

  if (!collected) {
    try {
      const anonymousIdToken = await getAnonymousIdToken(apiKey);
      collected = await collectMarkers({
        projectId,
        apiKey,
        idToken: anonymousIdToken,
        limit,
      });
      authMode = "anonymous";
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const anonymousBlocked = message.includes("ADMIN_ONLY_OPERATION");
      if (!anonymousBlocked) {
        throw error;
      }
      if (!fallbackEmail || !fallbackPassword) {
        throw new Error(
          "Anonymous auth is disabled for this Firebase project. Enter your AUS app email/password in the migration form to continue.",
        );
      }
      const passwordIdToken = await getPasswordIdToken(
        apiKey,
        fallbackEmail,
        fallbackPassword,
      );
      collected = await collectMarkers({
        projectId,
        apiKey,
        idToken: passwordIdToken,
        limit,
      });
      authMode = "password";
    }
  }

  if (!collected) {
    throw new Error("Live import failed without a recoverable auth method.");
  }

  return {
    source: "live-public",
    markers: collected.markers,
    totalFetched: collected.totalFetched,
    invalidRows: collected.invalidRows,
    authMode,
  };
}

