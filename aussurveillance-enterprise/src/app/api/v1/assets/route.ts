import { NextResponse } from "next/server";
import {
  type AuthContext,
  AuthError,
  authorizeRequest,
  type Scope,
} from "@/lib/enterprise-auth";
import { logAuditEvent } from "@/lib/audit-log";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import {
  listTenantAssets,
  replaceTenantAssets,
  resolveTenantId,
} from "@/lib/tenant-store";

const READ_SCOPES: Scope[] = ["tenant:read"];
const WRITE_SCOPES: Scope[] = ["tenant:write"];

const VALID_SEGMENTS = new Set(["retail", "healthcare", "logistics", "education"]);

interface AssetDraft {
  name: string;
  address: string;
  lat: number;
  lng: number;
  region?: string;
  segment?: "retail" | "healthcare" | "logistics" | "education";
  insuredValueAud?: number;
}

function allowPublicRead(): boolean {
  return (
    process.env.ALLOW_PUBLIC_TENANT_READ === "true" ||
    process.env.NODE_ENV !== "production"
  );
}

function allowPublicWrite(): boolean {
  return (
    process.env.ALLOW_PUBLIC_TENANT_WRITE === "true" ||
    process.env.NODE_ENV !== "production"
  );
}

function resolveAuth(
  request: Request,
  scopes: Scope[],
  fallbackActor: string,
  allowFallback: boolean,
): AuthContext {
  try {
    return authorizeRequest(request, scopes);
  } catch (error) {
    if (error instanceof AuthError && allowFallback) {
      return {
        actorId: fallbackActor,
        tenant: "public",
        authMethod: "api_key",
        scopes,
        role: "public",
      };
    }
    throw error;
  }
}

function splitCsvLine(line: string): string[] {
  const values: string[] = [];
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
      values.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  values.push(current.trim());
  return values;
}

function parseSegment(value: string | undefined): AssetDraft["segment"] {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (VALID_SEGMENTS.has(normalized)) {
    return normalized as AssetDraft["segment"];
  }
  return undefined;
}

function normalizeAssetRecord(record: Record<string, unknown>): AssetDraft | null {
  const name = String(record.name ?? "").trim();
  const address = String(record.address ?? "").trim();
  const lat = Number(record.lat);
  const lng = Number(record.lng);
  if (!name || !address || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  const insuredValueRaw =
    record.insuredValueAud !== undefined
      ? record.insuredValueAud
      : record.insuredvalueaud;
  const insuredValueAud =
    insuredValueRaw !== undefined ? Number(insuredValueRaw) : undefined;
  return {
    name,
    address,
    lat,
    lng,
    region: typeof record.region === "string" ? record.region.trim() : undefined,
    segment:
      typeof record.segment === "string" ? parseSegment(record.segment) : undefined,
    insuredValueAud:
      insuredValueAud !== undefined && Number.isFinite(insuredValueAud)
        ? Math.max(Math.round(insuredValueAud), 0)
        : undefined,
  };
}

function parseAssetsCsv(csv: string): AssetDraft[] {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) {
    return [];
  }
  const header = splitCsvLine(lines[0]).map((column) => column.toLowerCase());
  const assets: AssetDraft[] = [];
  for (const line of lines.slice(1)) {
    const columns = splitCsvLine(line);
    const row: Record<string, unknown> = {};
    for (let index = 0; index < header.length; index += 1) {
      row[header[index]] = columns[index] ?? "";
    }
    const asset = normalizeAssetRecord(row);
    if (asset) {
      assets.push(asset);
    }
  }
  return assets;
}

export async function GET(request: Request) {
  try {
    const auth = resolveAuth(
      request,
      READ_SCOPES,
      "public-assets-read",
      allowPublicRead(),
    );
    enforceRateLimit(
      request,
      {
        keyPrefix: "assets-read",
        maxRequests: 80,
        windowMs: 60_000,
      },
      auth.actorId,
    );

    const url = new URL(request.url);
    const tenantIdRaw = url.searchParams.get("tenantId") ?? undefined;
    const tenantId = await resolveTenantId(tenantIdRaw);
    const assets = await listTenantAssets(tenantId);

    return NextResponse.json({
      tenantId,
      count: assets.length,
      assets,
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json(
        { error: error.message },
        {
          status: error.status,
          headers: { "Retry-After": String(error.retryAfterSeconds) },
        },
      );
    }
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load assets.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = resolveAuth(
      request,
      WRITE_SCOPES,
      "public-assets-write",
      allowPublicWrite(),
    );
    enforceRateLimit(
      request,
      {
        keyPrefix: "assets-write",
        maxRequests: 20,
        windowMs: 60_000,
      },
      auth.actorId,
    );

    let payload: Record<string, unknown> = {};
    try {
      payload = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON payload." },
        { status: 400 },
      );
    }

    const tenantId = await resolveTenantId(
      typeof payload.tenantId === "string" ? payload.tenantId.trim() : undefined,
    );
    let assets: AssetDraft[] = [];
    if (typeof payload.csv === "string" && payload.csv.trim().length > 0) {
      assets = parseAssetsCsv(payload.csv);
    } else if (Array.isArray(payload.assets)) {
      assets = payload.assets
        .map((item) =>
          normalizeAssetRecord(
            item && typeof item === "object"
              ? (item as Record<string, unknown>)
              : {},
          ),
        )
        .filter((item): item is AssetDraft => Boolean(item));
    }
    if (assets.length === 0) {
      return NextResponse.json(
        {
          error:
            "No valid assets found. Provide CSV text or an assets array with name,address,lat,lng.",
        },
        { status: 400 },
      );
    }

    const saved = await replaceTenantAssets(tenantId, assets);
    await logAuditEvent({
      action: "assets.replace",
      status: "success",
      actorId: auth.actorId,
      actorEmail: auth.actorEmail,
      tenant: tenantId,
      authMethod: auth.authMethod,
      request,
      details: { count: saved.length },
    });

    return NextResponse.json({
      tenantId,
      count: saved.length,
      assets: saved,
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json(
        { error: error.message },
        {
          status: error.status,
          headers: { "Retry-After": String(error.retryAfterSeconds) },
        },
      );
    }
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to import assets.",
      },
      { status: 500 },
    );
  }
}
