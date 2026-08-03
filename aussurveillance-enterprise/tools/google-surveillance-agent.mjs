#!/usr/bin/env node

import { readFile, writeFile } from "fs/promises";
import path from "path";

function usage() {
  return `Usage:
  node tools/google-surveillance-agent.mjs --assets <assets.csv> [options]

Required:
  --assets <path>                 CSV with columns: id,name,address,lat,lng[,region,segment,insuredValueAud]

Options:
  --out <path>                    Output JSON file path (default: ./surveillance-batch-<label>.json)
  --batch-count <n>               Total batches for parallel agents (default: 1)
  --batch-index <n>               1-based batch index to run (default: 1)
  --asset-ids <id1,id2,...>       Explicit asset ID subset override
  --max-assets <n>                Max assets to process after filtering/batching (default: 250)
  --headings <list>               Comma list, e.g. 0,90,180,270 (default: 0,90,180,270)
  --radius-meters <n>             Street View radius (default: 120)
  --fov <n>                       Field of view 15-120 (default: 90)
  --pitch <n>                     Pitch -60 to 60 (default: 0)
  --threshold <0-1>               Detection threshold (default: 0.72)
  --emit-uncertain                Emit low-confidence candidates when imagery exists
  --uncertain-score <0-1>         Base confidence for uncertain candidates (default: 0.42)
  --label <name>                  Batch label in output metadata
  --plan-only                     Print batch assignment plan only and exit

Environment:
  GOOGLE_API_KEY                  Optional shared key for both Maps + Vision
  GOOGLE_MAPS_API_KEY             Required unless GOOGLE_API_KEY is set
  GOOGLE_VISION_API_KEY           Optional (falls back to GOOGLE_API_KEY)
`;
}

function looksLikePlaceholder(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return (
    normalized.includes("your_real") ||
    normalized.includes("your_key") ||
    normalized.includes("replace_me") ||
    normalized.includes("replace-with") ||
    normalized.includes("changeme") ||
    normalized === "..."
  );
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

function splitCsvLine(line) {
  const output = [];
  let current = "";
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      output.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  output.push(current.trim());
  return output;
}

function parseAssetsCsv(rawCsv) {
  const lines = rawCsv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length < 2) {
    return [];
  }
  const header = splitCsvLine(lines[0]).map((value) => value.toLowerCase());
  return lines
    .slice(1)
    .map((line, index) => {
      const columns = splitCsvLine(line);
      const row = {};
      header.forEach((name, columnIndex) => {
        row[name] = columns[columnIndex] ?? "";
      });
      const lat = Number(row.lat);
      const lng = Number(row.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return null;
      }
      const name = String(row.name ?? "").trim();
      if (!name) {
        return null;
      }
      const idRaw = String(row.id ?? "").trim();
      return {
        id: idRaw || `asset-${index + 1}`,
        name,
        address: String(row.address ?? "").trim(),
        lat,
        lng,
        region: String(row.region ?? "").trim() || undefined,
        segment: String(row.segment ?? "").trim() || undefined,
        insuredValueAud: Number.isFinite(Number(row.insuredvalueaud))
          ? Number(row.insuredvalueaud)
          : undefined,
      };
    })
    .filter((asset) => Boolean(asset));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function parseHeadings(raw) {
  const source = raw ? String(raw) : "0,90,180,270";
  return Array.from(
    new Set(
      source
        .split(",")
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isFinite(value))
        .map((value) => ((Math.round(value) % 360) + 360) % 360),
    ),
  );
}

function batchAssets(assets, batchCount, batchIndex) {
  if (batchCount <= 1) {
    return assets;
  }
  const groups = Array.from({ length: batchCount }, () => []);
  assets.forEach((asset, index) => {
    groups[index % batchCount].push(asset);
  });
  return groups[batchIndex - 1] ?? [];
}

function metadataUrl({ lat, lng, heading, radiusMeters, fov, pitch, apiKey }) {
  const params = new URLSearchParams({
    location: `${lat},${lng}`,
    heading: String(heading),
    radius: String(radiusMeters),
    fov: String(fov),
    pitch: String(pitch),
    key: apiKey,
  });
  return `https://maps.googleapis.com/maps/api/streetview/metadata?${params.toString()}`;
}

function imageUrl({ lat, lng, heading, radiusMeters, fov, pitch, apiKey }) {
  const params = new URLSearchParams({
    location: `${lat},${lng}`,
    size: "640x640",
    heading: String(heading),
    radius: String(radiusMeters),
    fov: String(fov),
    pitch: String(pitch),
    key: apiKey,
  });
  return `https://maps.googleapis.com/maps/api/streetview?${params.toString()}`;
}

async function fetchMetadata(url) {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      return null;
    }
    return await response.json();
  } catch {
    return null;
  }
}

const CAMERA_TERMS = [
  "camera",
  "cctv",
  "surveillance",
  "security camera",
  "traffic camera",
  "speed camera",
  "dome camera",
];

function hasCameraTerm(text) {
  const normalized = String(text ?? "").toLowerCase();
  return CAMERA_TERMS.some((term) => normalized.includes(term));
}

function topHits(items, max = 4) {
  return items
    .slice()
    .sort((a, b) => Number(b.score ?? 0) - Number(a.score ?? 0))
    .slice(0, max)
    .map((item) => ({
      description: String(item.description ?? item.name ?? ""),
      score: Number(item.score ?? 0),
    }));
}

async function detectCameraEvidence(streetViewUrl, visionApiKey) {
  if (!visionApiKey) {
    return {
      score: 0,
      sourceMatches: [],
      labelHits: [],
      objectHits: [],
      webHits: [],
    };
  }
  try {
    const imageResponse = await fetch(streetViewUrl, { cache: "no-store" });
    if (!imageResponse.ok) {
      return null;
    }
    const imageBytes = Buffer.from(await imageResponse.arrayBuffer());
    const endpoint = `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(
      visionApiKey,
    )}`;
    const annotateResponse = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          {
            image: { content: imageBytes.toString("base64") },
            features: [
              { type: "LABEL_DETECTION", maxResults: 30 },
              { type: "OBJECT_LOCALIZATION", maxResults: 20 },
              { type: "WEB_DETECTION", maxResults: 10 },
            ],
          },
        ],
      }),
    });
    if (!annotateResponse.ok) {
      return null;
    }
    const payload = await annotateResponse.json();
    const response = payload.responses?.[0];
    if (!response || response.error) {
      return null;
    }

    const labels = Array.isArray(response.labelAnnotations) ? response.labelAnnotations : [];
    const objects = Array.isArray(response.localizedObjectAnnotations)
      ? response.localizedObjectAnnotations
      : [];
    const webEntities = Array.isArray(response.webDetection?.webEntities)
      ? response.webDetection.webEntities
      : [];

    const labelHits = labels.filter((item) => hasCameraTerm(item.description));
    const objectHits = objects.filter((item) => hasCameraTerm(item.name));
    const webHits = webEntities.filter((item) => hasCameraTerm(item.description));

    const labelScore = labelHits.reduce(
      (best, item) => Math.max(best, Number(item.score ?? 0)),
      0,
    );
    const objectScore = objectHits.reduce(
      (best, item) => Math.max(best, Number(item.score ?? 0)),
      0,
    );
    const webScore = webHits.reduce(
      (best, item) => Math.max(best, Number(item.score ?? 0)),
      0,
    );

    const sourceMatches = [
      objectHits.length > 0 ? "object" : null,
      labelHits.length > 0 ? "label" : null,
      webHits.length > 0 ? "web" : null,
    ].filter((item) => Boolean(item));

    if (sourceMatches.length === 0) {
      return {
        score: 0,
        sourceMatches: [],
        labelHits: [],
        objectHits: [],
        webHits: [],
      };
    }

    const weighted =
      objectScore * 0.58 +
      labelScore * 0.27 +
      webScore * 0.15 +
      (sourceMatches.length >= 2 ? 0.08 : 0);

    return {
      score: clamp(weighted, 0, 0.99),
      sourceMatches,
      labelHits: topHits(labelHits),
      objectHits: topHits(objectHits),
      webHits: topHits(webHits),
    };
  } catch {
    return null;
  }
}

function markerFromObservation(detection, mode) {
  const confidenceScore =
    mode === "detected"
      ? Math.round(clamp(0.45 + detection.score * 0.5, 0.01, 0.99) * 100)
      : Math.round(clamp(detection.uncertainScore, 0.01, 0.99) * 100);
  const confidenceBand =
    confidenceScore >= 80 ? "high" : confidenceScore >= 62 ? "medium" : "low";
  const suffix =
    mode === "detected"
      ? detection.score.toFixed(3)
      : `uncertain-${confidenceScore}`;
  const note =
    mode === "detected"
      ? `Detected via standalone Google surveillance agent (${detection.asset.name}).`
      : `Uncertain candidate from Google Street View (${detection.asset.name}); send to human verification queue.`;
  const evidenceSummary =
    detection.evidence && detection.evidence.sourceMatches.length > 0
      ? `AI evidence: ${detection.evidence.sourceMatches.join(", ")}`
      : "AI evidence: no direct camera signal";
  return {
    id: `google-${detection.asset.id}-${detection.heading}-${suffix}`,
    lat: detection.lat,
    lng: detection.lng,
    type: "cctv",
    source:
      mode === "detected"
        ? "google-streetview-authorized"
        : "google-streetview-candidate",
    verified: mode === "detected" && detection.score >= detection.threshold + 0.08,
    userId: "google-surveillance-agent",
    notes: `${note} ${evidenceSummary}.`,
    cctvMode: "directional",
    direction: detection.heading,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    quality: {
      confidenceScore,
      confidenceBand,
      qualityVersion: 1,
    },
    provenance: {
      captureMethod: "google-streetview-agent-cli",
      appSurface: "standalone-agent",
      actorType: "authenticated",
      preview: {
        heading: detection.heading,
        radiusMeters: detection.radiusMeters,
        fov: detection.fov,
        pitch: detection.pitch,
      },
      aiEvidence: {
        model: "google-vision-label-object-web-v2",
        score: Number(detection.score ?? 0),
        threshold: Number(detection.threshold ?? 0),
        sourceMatches: detection.evidence?.sourceMatches ?? [],
        objectHits: detection.evidence?.objectHits ?? [],
        labelHits: detection.evidence?.labelHits ?? [],
        webHits: detection.evidence?.webHits ?? [],
      },
    },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.assets || args.help) {
    console.log(usage());
    process.exit(args.help ? 0 : 1);
  }

  const assetsPath = path.resolve(String(args.assets));
  let rawCsv = "";
  try {
    rawCsv = await readFile(assetsPath, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new Error(
        `Assets CSV not found at ${assetsPath}. Create it first or pass the correct --assets path.`,
      );
    }
    throw error;
  }
  let assets = parseAssetsCsv(rawCsv);
  if (assets.length === 0) {
    throw new Error(
      "No valid assets parsed. CSV must include at least id,name,lat,lng columns.",
    );
  }

  const explicitAssetIds = String(args["asset-ids"] ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  if (explicitAssetIds.length > 0) {
    assets = assets.filter((asset) => explicitAssetIds.includes(asset.id));
  }

  const batchCount = Math.max(Number(args["batch-count"] ?? 1), 1);
  const batchIndex = Math.max(Number(args["batch-index"] ?? 1), 1);
  if (batchIndex > batchCount) {
    throw new Error(`batch-index (${batchIndex}) cannot exceed batch-count (${batchCount}).`);
  }

  const batchPreview = Array.from({ length: batchCount }, (_, index) => {
    const grouped = batchAssets(assets, batchCount, index + 1);
    return {
      batchIndex: index + 1,
      assetCount: grouped.length,
      assetIds: grouped.map((asset) => asset.id),
    };
  });
  if (args["plan-only"]) {
    console.log(JSON.stringify({ assetsTotal: assets.length, batches: batchPreview }, null, 2));
    return;
  }

  const sharedApiKey = process.env.GOOGLE_API_KEY?.trim() || "";
  const mapsApiKey = process.env.GOOGLE_MAPS_API_KEY?.trim() || sharedApiKey;
  if (!mapsApiKey) {
    throw new Error("Set GOOGLE_MAPS_API_KEY or GOOGLE_API_KEY before running.");
  }
  if (looksLikePlaceholder(mapsApiKey)) {
    throw new Error(
      "Google Maps API key looks like a placeholder value. Set a real Google API key.",
    );
  }
  const visionApiKey = process.env.GOOGLE_VISION_API_KEY?.trim() || sharedApiKey;
  if (visionApiKey && looksLikePlaceholder(visionApiKey)) {
    throw new Error(
      "Google Vision API key looks like a placeholder value. Set a real key or unset it.",
    );
  }

  const headings = parseHeadings(args.headings);
  const radiusMeters = clamp(Number(args["radius-meters"] ?? 120), 5, 500);
  const fov = clamp(Number(args.fov ?? 90), 15, 120);
  const pitch = clamp(Number(args.pitch ?? 0), -60, 60);
  const threshold = clamp(Number(args.threshold ?? 0.72), 0.35, 0.98);
  const emitUncertain = Boolean(args["emit-uncertain"]);
  const uncertainScore = clamp(Number(args["uncertain-score"] ?? 0.42), 0.2, 0.7);
  const maxAssets = Math.max(Number(args["max-assets"] ?? 250), 1);
  const label =
    String(args.label ?? `batch-${batchIndex}-of-${batchCount}`).replace(
      /[^a-zA-Z0-9_-]+/g,
      "-",
    );

  const selectedAssets = batchAssets(assets, batchCount, batchIndex).slice(0, maxAssets);
  if (selectedAssets.length === 0) {
    throw new Error("No assets selected for this batch.");
  }

  const warnings = [];
  if (!visionApiKey) {
    warnings.push("GOOGLE_VISION_API_KEY not provided; detections may be low confidence.");
  }

  const markers = [];
  let assetsWithImagery = 0;
  let assetsWithDetections = 0;
  let imagesAnalyzed = 0;
  let visionErrors = 0;
  let uncertainMarkersGenerated = 0;

  for (const asset of selectedAssets) {
    let hasImagery = false;
    let hasDetection = false;
    for (const heading of headings) {
      const metadata = await fetchMetadata(
        metadataUrl({
          lat: asset.lat,
          lng: asset.lng,
          heading,
          radiusMeters,
          fov,
          pitch,
          apiKey: mapsApiKey,
        }),
      );
      imagesAnalyzed += 1;
      if (!metadata || metadata.status !== "OK") {
        continue;
      }
      hasImagery = true;
      const evidence = await detectCameraEvidence(
        imageUrl({
          lat: asset.lat,
          lng: asset.lng,
          heading,
          radiusMeters,
          fov,
          pitch,
          apiKey: mapsApiKey,
        }),
        visionApiKey,
      );
      if (evidence === null) {
        visionErrors += 1;
      }
      const score = evidence?.score ?? 0;
      if (score === null || score < threshold) {
        if (emitUncertain) {
          markers.push(
            markerFromObservation(
              {
                asset,
                heading,
                score: Number.isFinite(score) ? score : 0,
                threshold,
                lat: metadata.location?.lat ?? asset.lat,
                lng: metadata.location?.lng ?? asset.lng,
                uncertainScore,
                evidence,
                radiusMeters,
                fov,
                pitch,
              },
              "uncertain",
            ),
          );
          uncertainMarkersGenerated += 1;
        }
        continue;
      }
      hasDetection = true;
      markers.push(
        markerFromObservation(
          {
            asset,
            heading,
            score,
            threshold,
            lat: metadata.location?.lat ?? asset.lat,
            lng: metadata.location?.lng ?? asset.lng,
            uncertainScore,
            evidence,
            radiusMeters,
            fov,
            pitch,
          },
          "detected",
        ),
      );
    }
    if (hasImagery) {
      assetsWithImagery += 1;
    }
    if (hasDetection) {
      assetsWithDetections += 1;
    }
  }

  if (markers.length === 0) {
    warnings.push("No markers reached threshold. Lower --threshold or increase --radius-meters.");
  }
  if (visionErrors > 0) {
    warnings.push(
      `Vision scored ${visionErrors} images as unavailable/error; run surveillance:doctor to inspect key/API access.`,
    );
  }

  const output = {
    mode: "markers",
    batchLabel: label,
    generatedAt: new Date().toISOString(),
    settings: {
      batchCount,
      batchIndex,
      maxAssets,
      headings,
      radiusMeters,
      fov,
      pitch,
      threshold,
      emitUncertain,
      uncertainScore,
    },
    diagnostics: {
      assetsRequested: assets.length,
      assetsProcessed: selectedAssets.length,
      assetsWithImagery,
      assetsWithDetections,
      imagesAnalyzed,
      visionErrors,
      uncertainMarkersGenerated,
      markersGenerated: markers.length,
    },
    selectedAssetIds: selectedAssets.map((asset) => asset.id),
    warnings,
    markers,
  };

  const outputPath = path.resolve(
    String(args.out ?? `./surveillance-batch-${label}.json`),
  );
  await writeFile(outputPath, JSON.stringify(output, null, 2), "utf8");
  console.log(`Saved output to ${outputPath}`);
  console.log(
    `Diagnostics: assets=${selectedAssets.length}, imagery=${assetsWithImagery}, detections=${assetsWithDetections}, uncertain=${uncertainMarkersGenerated}, markers=${markers.length}, images=${imagesAnalyzed}`,
  );
  if (warnings.length > 0) {
    console.log("Warnings:");
    for (const warning of warnings) {
      console.log(`- ${warning}`);
    }
  }
  if (markers.length === 0) {
    console.log(
      "No markers generated. Common causes: invalid API key, APIs not enabled, no Street View imagery within radius, or threshold too high.",
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
