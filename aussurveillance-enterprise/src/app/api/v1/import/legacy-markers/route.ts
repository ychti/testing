import { NextResponse } from "next/server";
import {
  isValidLegacyMarker,
  type LegacyMarker,
} from "@/lib/legacy-model";
import { migrateLegacyMarkersToPortfolio } from "@/lib/legacy-migration";

interface ImportPayload {
  markers?: unknown;
}

export async function POST(request: Request) {
  let payload: ImportPayload;
  try {
    payload = (await request.json()) as ImportPayload;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON payload." },
      { status: 400 },
    );
  }

  if (!Array.isArray(payload.markers)) {
    return NextResponse.json(
      { error: "markers must be an array." },
      { status: 400 },
    );
  }

  if (payload.markers.length === 0) {
    return NextResponse.json(
      { error: "markers array cannot be empty." },
      { status: 400 },
    );
  }

  if (payload.markers.length > 50_000) {
    return NextResponse.json(
      { error: "markers array exceeds 50,000 record limit for preview ingestion." },
      { status: 413 },
    );
  }

  const filtered = payload.markers.filter(isValidLegacyMarker) as LegacyMarker[];
  const result = migrateLegacyMarkersToPortfolio(filtered);
  return NextResponse.json(result);
}
