#!/usr/bin/env node

import { readFile, writeFile } from "fs/promises";
import path from "path";

function usage() {
  return `Usage:
  node tools/google-surveillance-doctor.mjs [options]

Options:
  --assets <path>                 Optional asset CSV to sample for imagery coverage
  --sample-assets <n>             Number of asset rows to test (default: 6)
  --sample-location <lat,lng>     Baseline Street View probe (default: -33.8688,151.2093)
  --radius-meters <n>             Street View radius for checks (default: 250)
  --out <path>                    Save JSON report to file

Environment:
  GOOGLE_API_KEY                  Optional shared key for Maps + Vision
  GOOGLE_MAPS_API_KEY             Required unless GOOGLE_API_KEY is set
  GOOGLE_VISION_API_KEY           Optional (falls back to GOOGLE_API_KEY)
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
    normalized.includes("paste") ||
    normalized === "..."
  );
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
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
      return {
        id: String(row.id ?? "").trim() || `asset-${index + 1}`,
        name,
        lat,
        lng,
      };
    })
    .filter((asset) => Boolean(asset));
}

function metadataUrl({ lat, lng, radiusMeters, apiKey }) {
  const params = new URLSearchParams({
    location: `${lat},${lng}`,
    radius: String(radiusMeters),
    key: apiKey,
  });
  return `https://maps.googleapis.com/maps/api/streetview/metadata?${params.toString()}`;
}

function imageUrl({ lat, lng, radiusMeters, apiKey }) {
  const params = new URLSearchParams({
    location: `${lat},${lng}`,
    size: "640x640",
    radius: String(radiusMeters),
    key: apiKey,
  });
  return `https://maps.googleapis.com/maps/api/streetview?${params.toString()}`;
}

async function fetchJson(url) {
  try {
    const response = await fetch(url, { cache: "no-store" });
    const json = await response.json().catch(() => null);
    return {
      ok: response.ok,
      statusCode: response.status,
      json,
    };
  } catch (error) {
    return {
      ok: false,
      statusCode: 0,
      json: null,
      networkError: error instanceof Error ? error.message : "network error",
    };
  }
}

async function probeStreetView({ lat, lng, radiusMeters, mapsApiKey }) {
  const response = await fetchJson(
    metadataUrl({ lat, lng, radiusMeters, apiKey: mapsApiKey }),
  );
  const payload = response.json && typeof response.json === "object" ? response.json : {};
  return {
    lat,
    lng,
    httpStatus: response.statusCode,
    ok: response.ok,
    streetViewStatus: String(payload.status ?? "UNKNOWN"),
    errorMessage: payload.error_message ? String(payload.error_message) : undefined,
    panoId: payload.pano_id ? String(payload.pano_id) : undefined,
    imageryDate: payload.date ? String(payload.date) : undefined,
    location:
      payload.location &&
      typeof payload.location.lat === "number" &&
      typeof payload.location.lng === "number"
        ? {
            lat: payload.location.lat,
            lng: payload.location.lng,
          }
        : undefined,
    networkError: response.networkError,
  };
}

async function probeVision({ lat, lng, radiusMeters, mapsApiKey, visionApiKey }) {
  if (!visionApiKey) {
    return {
      status: "skipped",
      reason: "GOOGLE_VISION_API_KEY and GOOGLE_API_KEY are both unset.",
    };
  }
  const imageResponse = await fetch(
    imageUrl({ lat, lng, radiusMeters, apiKey: mapsApiKey }),
    { cache: "no-store" },
  ).catch((error) => {
    return {
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : "image fetch failed",
    };
  });
  if (!imageResponse || !imageResponse.ok) {
    return {
      status: "failed",
      reason:
        "Could not fetch Street View image for Vision check.",
      imageHttpStatus: imageResponse?.status ?? 0,
      imageError:
        "error" in imageResponse && typeof imageResponse.error === "string"
          ? imageResponse.error
          : undefined,
    };
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
          features: [{ type: "LABEL_DETECTION", maxResults: 10 }],
        },
      ],
    }),
  }).catch((error) => {
    return {
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : "vision request failed",
    };
  });
  if (!annotateResponse || !annotateResponse.ok) {
    return {
      status: "failed",
      reason: "Vision API request failed.",
      visionHttpStatus: annotateResponse?.status ?? 0,
      visionError:
        "error" in annotateResponse && typeof annotateResponse.error === "string"
          ? annotateResponse.error
          : undefined,
    };
  }
  const payload = await annotateResponse.json().catch(() => ({}));
  const error = payload.responses?.[0]?.error;
  if (error) {
    return {
      status: "failed",
      reason: "Vision API returned an error payload.",
      visionErrorCode: error.code,
      visionErrorMessage: error.message,
    };
  }
  const labels = Array.isArray(payload.responses?.[0]?.labelAnnotations)
    ? payload.responses[0].labelAnnotations
    : [];
  return {
    status: "ok",
    topLabels: labels.slice(0, 5).map((label) => ({
      description: label.description,
      score: label.score,
    })),
  };
}

function parseSampleLocation(rawValue) {
  const source = String(rawValue ?? "-33.8688,151.2093");
  const [latRaw, lngRaw] = source.split(",");
  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error(`Invalid --sample-location value: "${source}"`);
  }
  return { lat, lng };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const sharedApiKey = process.env.GOOGLE_API_KEY?.trim() || "";
  const mapsApiKey = process.env.GOOGLE_MAPS_API_KEY?.trim() || sharedApiKey;
  const visionApiKey = process.env.GOOGLE_VISION_API_KEY?.trim() || sharedApiKey;

  if (!mapsApiKey) {
    throw new Error(
      "Missing Google API key. Set GOOGLE_MAPS_API_KEY or GOOGLE_API_KEY first.",
    );
  }
  if (looksLikePlaceholder(mapsApiKey)) {
    throw new Error(
      "Google Maps key looks like a placeholder. Paste the full real key value.",
    );
  }
  if (visionApiKey && looksLikePlaceholder(visionApiKey)) {
    throw new Error(
      "Google Vision key looks like a placeholder. Paste a real key or unset it.",
    );
  }

  const radiusMeters = clamp(Number(args["radius-meters"] ?? 250), 5, 1000);
  const sampleLocation = parseSampleLocation(args["sample-location"]);
  const sampleAssets = Math.max(Number(args["sample-assets"] ?? 6), 1);

  const baseline = await probeStreetView({
    lat: sampleLocation.lat,
    lng: sampleLocation.lng,
    radiusMeters,
    mapsApiKey,
  });

  let assetsCheck = null;
  const probeLocations = [sampleLocation];
  if (args.assets) {
    const assetsPath = path.resolve(String(args.assets));
    const rawCsv = await readFile(assetsPath, "utf8").catch((error) => {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        throw new Error(`Assets CSV not found at ${assetsPath}`);
      }
      throw error;
    });
    const assets = parseAssetsCsv(rawCsv).slice(0, sampleAssets);
    if (assets.length === 0) {
      assetsCheck = {
        sampled: 0,
        statusCounts: {},
        rows: [],
        warning: "No valid asset rows parsed from CSV.",
      };
    } else {
      const rows = [];
      const statusCounts = {};
      for (const asset of assets) {
        const probe = await probeStreetView({
          lat: asset.lat,
          lng: asset.lng,
          radiusMeters,
          mapsApiKey,
        });
        probeLocations.push({ lat: asset.lat, lng: asset.lng });
        rows.push({
          id: asset.id,
          name: asset.name,
          lat: asset.lat,
          lng: asset.lng,
          streetViewStatus: probe.streetViewStatus,
          errorMessage: probe.errorMessage,
        });
        statusCounts[probe.streetViewStatus] = (statusCounts[probe.streetViewStatus] ?? 0) + 1;
      }
      assetsCheck = {
        sampled: rows.length,
        statusCounts,
        rows,
      };
    }
  }

  const visionProbeLocation =
    baseline.streetViewStatus === "OK"
      ? sampleLocation
      : probeLocations[0];
  const vision = await probeVision({
    lat: visionProbeLocation.lat,
    lng: visionProbeLocation.lng,
    radiusMeters,
    mapsApiKey,
    visionApiKey,
  });

  const diagnosis = [];
  const nextActions = [];
  let hardFail = false;

  if (baseline.streetViewStatus === "REQUEST_DENIED") {
    hardFail = true;
    diagnosis.push("Maps API access denied.");
    nextActions.push(
      "In Google Cloud, enable Street View Static API on the same project as your key.",
    );
    nextActions.push(
      "If key restrictions are enabled, allow Street View Static API and disable incompatible restrictions.",
    );
  } else if (baseline.streetViewStatus === "ZERO_RESULTS") {
    diagnosis.push("Maps key appears valid, but the probe coordinate has no Street View imagery.");
    nextActions.push(
      "Increase --radius-meters to 500 and test asset coordinates in dense streets.",
    );
  } else if (baseline.streetViewStatus === "OK") {
    diagnosis.push("Maps API check passed.");
  } else {
    diagnosis.push(`Maps probe returned status ${baseline.streetViewStatus}.`);
  }

  if (vision.status === "failed") {
    hardFail = true;
    diagnosis.push("Vision API check failed.");
    nextActions.push("Enable Vision API on the same Google project/key.");
  } else if (vision.status === "skipped") {
    diagnosis.push("Vision check skipped (no Vision key configured).");
    nextActions.push("Set GOOGLE_VISION_API_KEY or GOOGLE_API_KEY to enable AI scoring.");
  } else {
    diagnosis.push("Vision API check passed.");
  }

  const report = {
    generatedAt: new Date().toISOString(),
    keyMode: {
      usingSharedApiKey: Boolean(sharedApiKey),
      hasMapsKey: Boolean(mapsApiKey),
      hasVisionKey: Boolean(visionApiKey),
    },
    settings: {
      radiusMeters,
      sampleLocation,
      sampleAssets,
      assetsPath: args.assets ? path.resolve(String(args.assets)) : null,
    },
    checks: {
      mapsBaseline: baseline,
      assetsCoverage: assetsCheck,
      vision,
    },
    diagnosis,
    nextActions,
  };

  if (args.out) {
    const outputPath = path.resolve(String(args.out));
    await writeFile(outputPath, JSON.stringify(report, null, 2), "utf8");
    console.log(`Saved doctor report to ${outputPath}`);
  }
  console.log(JSON.stringify(report, null, 2));

  if (hardFail) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
