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
  --label <name>                  Batch label in output metadata
  --plan-only                     Print batch assignment plan only and exit

Environment:
  GOOGLE_MAPS_API_KEY             Required
  GOOGLE_VISION_API_KEY           Optional but strongly recommended
`;
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

async function detectCameraScore(streetViewUrl, visionApiKey) {
  if (!visionApiKey) {
    return 0;
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
            features: [{ type: "LABEL_DETECTION", maxResults: 20 }],
          },
        ],
      }),
    });
    if (!annotateResponse.ok) {
      return null;
    }
    const payload = await annotateResponse.json();
    const labels = payload.responses?.[0]?.labelAnnotations ?? [];
    const candidates = labels.filter((label) => {
      const text = String(label.description ?? "").toLowerCase();
      return (
        text.includes("camera") ||
        text.includes("cctv") ||
        text.includes("surveillance") ||
        text.includes("security camera")
      );
    });
    if (candidates.length === 0) {
      return 0;
    }
    return candidates.reduce((best, label) => Math.max(best, Number(label.score ?? 0)), 0);
  } catch {
    return null;
  }
}

function markersFromDetections(detection) {
  return {
    id: `google-${detection.asset.id}-${detection.heading}-${detection.score.toFixed(3)}`,
    lat: detection.lat,
    lng: detection.lng,
    type: "cctv",
    source: "google-streetview-authorized",
    verified: detection.score >= detection.threshold + 0.08,
    userId: "google-surveillance-agent",
    notes: `Detected via standalone Google surveillance agent (${detection.asset.name}).`,
    cctvMode: "directional",
    direction: detection.heading,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    quality: {
      confidenceScore: Math.round(clamp(0.45 + detection.score * 0.5, 0.01, 0.99) * 100),
      confidenceBand:
        detection.score >= 0.8 ? "high" : detection.score >= 0.62 ? "medium" : "low",
      qualityVersion: 1,
    },
    provenance: {
      captureMethod: "google-streetview-agent-cli",
      appSurface: "standalone-agent",
      actorType: "authenticated",
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

  const mapsApiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!mapsApiKey) {
    throw new Error("GOOGLE_MAPS_API_KEY is required.");
  }
  const visionApiKey = process.env.GOOGLE_VISION_API_KEY?.trim() || "";

  const headings = parseHeadings(args.headings);
  const radiusMeters = clamp(Number(args["radius-meters"] ?? 120), 5, 500);
  const fov = clamp(Number(args.fov ?? 90), 15, 120);
  const pitch = clamp(Number(args.pitch ?? 0), -60, 60);
  const threshold = clamp(Number(args.threshold ?? 0.72), 0.35, 0.98);
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
      const score = await detectCameraScore(
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
      if (score === null || score < threshold) {
        continue;
      }
      hasDetection = true;
      markers.push(
        markersFromDetections({
          asset,
          heading,
          score,
          threshold,
          lat: metadata.location?.lat ?? asset.lat,
          lng: metadata.location?.lng ?? asset.lng,
        }),
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
    },
    diagnostics: {
      assetsRequested: assets.length,
      assetsProcessed: selectedAssets.length,
      assetsWithImagery,
      assetsWithDetections,
      imagesAnalyzed,
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
  console.log(
    `Saved ${markers.length} markers from ${selectedAssets.length} assets to ${outputPath}`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
