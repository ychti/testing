import type { LegacyMarker } from "@/lib/legacy-model";
import type { AssetRecord } from "@/lib/tenant-store";

interface StreetViewMetadataResponse {
  status: string;
  location?: { lat: number; lng: number };
  pano_id?: string;
  date?: string;
}

interface VisionLabel {
  description?: string;
  score?: number;
}

interface VisionAnnotateResponse {
  responses?: Array<{
    labelAnnotations?: VisionLabel[];
  }>;
}

export interface GoogleStreetViewImportDiagnostics {
  assetsRequested: number;
  assetsProcessed: number;
  assetsWithImagery: number;
  assetsWithDetections: number;
  imagesAnalyzed: number;
  markersGenerated: number;
  detectionThreshold: number;
  headingsEvaluated: number;
}

export interface GoogleStreetViewImportResult {
  markers: LegacyMarker[];
  diagnostics: GoogleStreetViewImportDiagnostics;
  warnings: string[];
}

interface CollectorOptions {
  assets: AssetRecord[];
  maxAssets?: number;
  headings?: number[];
  fov?: number;
  pitch?: number;
  radiusMeters?: number;
  detectionThreshold?: number;
}

const DEFAULT_HEADINGS = [0, 90, 180, 270];
const DEFAULT_STREETVIEW_SIZE = "640x640";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeHeadings(headings?: number[]): number[] {
  if (!headings || headings.length === 0) {
    return DEFAULT_HEADINGS;
  }
  const normalized = headings
    .filter((value) => Number.isFinite(value))
    .map((value) => ((Math.round(value) % 360) + 360) % 360);
  return Array.from(new Set(normalized)).slice(0, 12);
}

function metadataUrl(input: {
  lat: number;
  lng: number;
  heading: number;
  radiusMeters: number;
  fov: number;
  pitch: number;
  apiKey: string;
}): string {
  const params = new URLSearchParams({
    location: `${input.lat},${input.lng}`,
    heading: String(input.heading),
    radius: String(input.radiusMeters),
    fov: String(input.fov),
    pitch: String(input.pitch),
    key: input.apiKey,
  });
  return `https://maps.googleapis.com/maps/api/streetview/metadata?${params.toString()}`;
}

function imageUrl(input: {
  lat: number;
  lng: number;
  heading: number;
  radiusMeters: number;
  fov: number;
  pitch: number;
  apiKey: string;
}): string {
  const params = new URLSearchParams({
    location: `${input.lat},${input.lng}`,
    size: DEFAULT_STREETVIEW_SIZE,
    heading: String(input.heading),
    radius: String(input.radiusMeters),
    fov: String(input.fov),
    pitch: String(input.pitch),
    key: input.apiKey,
  });
  return `https://maps.googleapis.com/maps/api/streetview?${params.toString()}`;
}

async function fetchStreetViewMetadata(
  url: string,
): Promise<StreetViewMetadataResponse | null> {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as StreetViewMetadataResponse;
  } catch {
    return null;
  }
}

async function detectCameraConfidence(
  streetViewImageUrl: string,
  visionApiKey: string,
): Promise<number | null> {
  try {
    const imageResponse = await fetch(streetViewImageUrl, { cache: "no-store" });
    if (!imageResponse.ok) {
      return null;
    }
    const imageArrayBuffer = await imageResponse.arrayBuffer();
    const imageBytes = Buffer.from(imageArrayBuffer);
    const content = imageBytes.toString("base64");
    const visionEndpoint = `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(
      visionApiKey,
    )}`;
    const annotateResponse = await fetch(visionEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          {
            image: { content },
            features: [
              { type: "LABEL_DETECTION", maxResults: 20 },
              { type: "OBJECT_LOCALIZATION", maxResults: 20 },
            ],
          },
        ],
      }),
    });
    if (!annotateResponse.ok) {
      return null;
    }
    const payload = (await annotateResponse.json()) as VisionAnnotateResponse;
    const labels = payload.responses?.[0]?.labelAnnotations ?? [];
    const candidateLabels = labels.filter((label) => {
      const description = (label.description ?? "").toLowerCase();
      return (
        description.includes("camera") ||
        description.includes("cctv") ||
        description.includes("surveillance") ||
        description.includes("security system") ||
        description.includes("security camera")
      );
    });
    if (candidateLabels.length === 0) {
      return 0;
    }
    const topScore = candidateLabels.reduce(
      (best, label) => Math.max(best, label.score ?? 0),
      0,
    );
    return clamp(topScore, 0, 1);
  } catch {
    return null;
  }
}

function scoreToConfidence(score: number): number {
  return Math.round(clamp(0.45 + score * 0.5, 0.01, 0.99) * 100);
}

export async function importAuthorizedGoogleStreetView(
  options: CollectorOptions,
): Promise<GoogleStreetViewImportResult> {
  const warnings: string[] = [];
  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "GOOGLE_MAPS_API_KEY is missing. Configure it before using Google Street View import.",
    );
  }
  const visionApiKey =
    process.env.GOOGLE_VISION_API_KEY?.trim() || process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!visionApiKey) {
    warnings.push(
      "Google Vision key is not configured. No camera detections can be verified.",
    );
  }

  const maxAssets = Math.min(Math.max(options.maxAssets ?? 250, 1), 5000);
  const headings = normalizeHeadings(options.headings);
  const fov = clamp(options.fov ?? 90, 15, 120);
  const pitch = clamp(options.pitch ?? 0, -60, 60);
  const radiusMeters = clamp(
    options.radiusMeters ?? Number(process.env.GOOGLE_STREETVIEW_RADIUS_METERS ?? 120),
    5,
    500,
  );
  const detectionThreshold = clamp(options.detectionThreshold ?? 0.72, 0.35, 0.98);
  const assets = options.assets.slice(0, maxAssets);

  const markers: LegacyMarker[] = [];
  let assetsProcessed = 0;
  let assetsWithImagery = 0;
  let assetsWithDetections = 0;
  let imagesAnalyzed = 0;

  for (const asset of assets) {
    let assetHasImagery = false;
    let assetDetected = false;
    for (const heading of headings) {
      const metadata = await fetchStreetViewMetadata(
        metadataUrl({
          lat: asset.lat,
          lng: asset.lng,
          heading,
          radiusMeters,
          fov,
          pitch,
          apiKey,
        }),
      );
      imagesAnalyzed += 1;
      if (!metadata || metadata.status !== "OK") {
        continue;
      }
      assetHasImagery = true;
      if (!visionApiKey) {
        continue;
      }

      const image = imageUrl({
        lat: asset.lat,
        lng: asset.lng,
        heading,
        radiusMeters,
        fov,
        pitch,
        apiKey,
      });
      const detectionScore = await detectCameraConfidence(image, visionApiKey);
      if (detectionScore === null || detectionScore < detectionThreshold) {
        continue;
      }

      assetDetected = true;
      const confidence = scoreToConfidence(detectionScore);
      markers.push({
        id: `google-${asset.id}-${heading}-${Math.round(detectionScore * 1000)}`,
        lat: metadata.location?.lat ?? asset.lat,
        lng: metadata.location?.lng ?? asset.lng,
        type: "cctv",
        source: "google-streetview-authorized",
        verified: detectionScore >= Math.min(detectionThreshold + 0.08, 0.96),
        userId: "google-streetview-bot",
        notes: `Authorized Google Street View detection at heading ${heading} for ${asset.name}.`,
        cctvMode: "directional",
        direction: heading,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        quality: {
          confidenceScore: confidence,
          confidenceBand:
            confidence >= 85 ? "high" : confidence >= 65 ? "medium" : "low",
          qualityVersion: 1,
        },
        provenance: {
          captureMethod: "google-streetview-authorized",
          appSurface: "streetview-import",
          actorType: "authenticated",
        },
      });
    }
    assetsProcessed += 1;
    if (assetHasImagery) {
      assetsWithImagery += 1;
    }
    if (assetDetected) {
      assetsWithDetections += 1;
    }
  }

  if (assetsWithImagery === 0) {
    warnings.push(
      "No Street View imagery returned for selected assets/radius. Increase radius or verify coordinates.",
    );
  }
  if (markers.length === 0) {
    warnings.push(
      "No camera detections met threshold. Lower threshold or improve coverage/imagery quality.",
    );
  }

  return {
    markers,
    diagnostics: {
      assetsRequested: options.assets.length,
      assetsProcessed,
      assetsWithImagery,
      assetsWithDetections,
      imagesAnalyzed,
      markersGenerated: markers.length,
      detectionThreshold,
      headingsEvaluated: headings.length,
    },
    warnings,
  };
}
