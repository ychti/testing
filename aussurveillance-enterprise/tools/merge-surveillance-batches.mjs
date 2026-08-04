#!/usr/bin/env node

import { readFile, writeFile } from "fs/promises";
import path from "path";

function usage() {
  return `Usage:
  node tools/merge-surveillance-batches.mjs --out <merged.json> <batch1.json> <batch2.json> [...]
`;
}

function parseArgs(argv) {
  const args = { files: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) {
        args[key] = true;
      } else {
        args[key] = next;
        index += 1;
      }
      continue;
    }
    args.files.push(token);
  }
  return args;
}

function markerKey(marker) {
  const lat = Number(marker.lat ?? 0).toFixed(5);
  const lng = Number(marker.lng ?? 0).toFixed(5);
  const direction =
    Number.isFinite(Number(marker.direction)) ? String(Math.round(marker.direction)) : "na";
  return `${marker.type ?? "cctv"}|${lat}|${lng}|${direction}|${marker.source ?? "unknown"}`;
}

async function extractMarkers(filePath) {
  const raw = await readFile(filePath, "utf8");
  const payload = JSON.parse(raw);
  if (Array.isArray(payload)) {
    return payload;
  }
  if (Array.isArray(payload.markers)) {
    return payload.markers;
  }
  if (Array.isArray(payload.items)) {
    return payload.items;
  }
  return [];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.out || args.files.length === 0) {
    console.log(usage());
    process.exit(args.help ? 0 : 1);
  }

  const merged = [];
  const seen = new Set();
  const sources = [];

  for (const inputFile of args.files) {
    const resolved = path.resolve(inputFile);
    const markers = await extractMarkers(resolved);
    sources.push({ file: resolved, markerCount: markers.length });
    for (const marker of markers) {
      const key = markerKey(marker);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      merged.push(marker);
    }
  }

  const output = {
    mergedAt: new Date().toISOString(),
    sourceFiles: sources,
    markerCount: merged.length,
    markers: merged,
  };
  const outputPath = path.resolve(String(args.out));
  await writeFile(outputPath, JSON.stringify(output, null, 2), "utf8");
  console.log(`Merged ${merged.length} markers -> ${outputPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
