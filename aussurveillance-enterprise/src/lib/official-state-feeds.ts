import type { LegacyMarker } from "@/lib/legacy-model";

const DEFAULT_IMPORTER_BASE_URL =
  "https://raw.githubusercontent.com/ychti/aus-surveillance/main";

const FEED_FILE_BY_STATE = {
  NSW: "nsw-importer.html",
  QLD: "qld-importer.html",
  VIC: "vic-importer.html",
  SA: "sa-importer.html",
  WA: "wa-importer.html",
  ACT: "act-importer.html",
} as const;

export type FeedState = keyof typeof FEED_FILE_BY_STATE;

export interface OfficialStateFeedStatus {
  state: FeedState;
  url: string;
  status: "ok" | "error";
  markerCount: number;
  error?: string;
}

export interface OfficialStateFeedImportResult {
  markers: LegacyMarker[];
  statuses: OfficialStateFeedStatus[];
  warnings: string[];
}

function toState(input: string): FeedState | null {
  const normalized = input.trim().toUpperCase();
  return normalized in FEED_FILE_BY_STATE
    ? (normalized as FeedState)
    : null;
}

function parseNumberField(source: string, field: string): number | null {
  const match = source.match(new RegExp(`${field}\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`, "i"));
  if (!match) {
    return null;
  }
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function parseStringField(source: string, field: string): string | null {
  const match = source.match(
    new RegExp(`${field}\\s*:\\s*(['"\`])([\\s\\S]*?)\\1`, "i"),
  );
  return match ? match[2].trim() : null;
}

function inferCctvMode(snippet: string): LegacyMarker["cctvMode"] {
  const directional = parseNumberField(snippet, "direction");
  if (directional !== null) {
    return "directional";
  }
  const mode = parseStringField(snippet, "cctvMode");
  if (mode === "directional" || mode === "dome360") {
    return mode;
  }
  return null;
}

function inferMarkerType(snippet: string): LegacyMarker["type"] {
  const explicit = parseStringField(snippet, "type");
  if (explicit && explicit.length > 0) {
    return explicit.toLowerCase();
  }
  if (snippet.toLowerCase().includes("redlight")) {
    return "redlight";
  }
  if (snippet.toLowerCase().includes("speed")) {
    return "speed";
  }
  return "cctv";
}

function parseMarkersFromImporterHtml(html: string, state: FeedState): LegacyMarker[] {
  const objectLikeSnippets = html.match(/\{[^{}]{20,1200}\}/g) ?? [];
  const markers: LegacyMarker[] = [];
  const seen = new Set<string>();
  const nowIso = new Date().toISOString();
  let index = 0;

  for (const snippet of objectLikeSnippets) {
    const lat = parseNumberField(snippet, "lat");
    const lng = parseNumberField(snippet, "lng");
    if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      continue;
    }
    const type = inferMarkerType(snippet);
    const key = `${type}|${lat.toFixed(5)}|${lng.toFixed(5)}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    index += 1;
    const sourceLabel = parseStringField(snippet, "source") ?? `${state} official importer`;
    const notes = parseStringField(snippet, "notes");
    const direction = parseNumberField(snippet, "direction");
    markers.push({
      id: `${state.toLowerCase()}-official-${index}`,
      lat,
      lng,
      type,
      source: "imported-official",
      verified: true,
      userId: "official-importer",
      notes: notes ?? sourceLabel,
      cctvMode: inferCctvMode(snippet),
      direction,
      createdAt: nowIso,
      updatedAt: nowIso,
      provenance: {
        captureMethod: "official-state-importer",
        appSurface: `${state.toLowerCase()}-importer`,
        actorType: "authenticated",
      },
      quality: {
        confidenceScore: 84,
        confidenceBand: "high",
        qualityVersion: 1,
      },
    });
  }

  return markers;
}

async function fetchStateMarkers(state: FeedState): Promise<{
  status: OfficialStateFeedStatus;
  markers: LegacyMarker[];
}> {
  const baseUrl =
    process.env.AUS_SURVEILLANCE_IMPORTER_BASE_URL?.trim() || DEFAULT_IMPORTER_BASE_URL;
  const path = FEED_FILE_BY_STATE[state];
  const url = `${baseUrl.replace(/\/+$/, "")}/${path}`;

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
      },
      cache: "no-store",
    });
    if (!response.ok) {
      return {
        status: {
          state,
          url,
          status: "error",
          markerCount: 0,
          error: `HTTP ${response.status}`,
        },
        markers: [],
      };
    }
    const html = await response.text();
    const markers = parseMarkersFromImporterHtml(html, state);
    return {
      status: { state, url, status: "ok", markerCount: markers.length },
      markers,
    };
  } catch (error) {
    return {
      status: {
        state,
        url,
        status: "error",
        markerCount: 0,
        error: error instanceof Error ? error.message : "unknown fetch error",
      },
      markers: [],
    };
  }
}

export async function importOfficialStateFeeds(
  requestedStates?: string[],
): Promise<OfficialStateFeedImportResult> {
  const normalizedStates = (
    requestedStates && requestedStates.length > 0
      ? requestedStates
      : Object.keys(FEED_FILE_BY_STATE)
  )
    .map((state) => toState(state))
    .filter((state): state is FeedState => Boolean(state));

  const states = normalizedStates.length > 0
    ? Array.from(new Set(normalizedStates))
    : (Object.keys(FEED_FILE_BY_STATE) as FeedState[]);

  const results = await Promise.all(states.map((state) => fetchStateMarkers(state)));
  const statuses = results.map((item) => item.status);
  const markers = results.flatMap((item) => item.markers);
  const warnings = statuses
    .filter((item) => item.status === "error")
    .map((item) => `${item.state} feed failed (${item.error ?? "unknown error"}).`);
  if (markers.length < 1000) {
    warnings.push(
      "Official feed ingestion returned low volume. Verify upstream importer pages and public source availability.",
    );
  }

  return { markers, statuses, warnings };
}
