import type { DocumentData } from "firebase-admin/firestore";
import { getFirestoreAdmin } from "@/lib/firebase-admin";
import type { LegacyMarker } from "@/lib/legacy-model";
import { normalizeMarkerData } from "@/lib/marker-normalization";

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
    const normalized = normalizeMarkerData(doc.id, doc.data() as DocumentData);
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

