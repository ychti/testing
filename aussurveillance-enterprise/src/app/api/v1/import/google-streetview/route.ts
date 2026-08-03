import { NextResponse } from "next/server";
import {
  type AuthContext,
  AuthError,
  authorizeRequest,
  type Scope,
} from "@/lib/enterprise-auth";
import { logAuditEvent } from "@/lib/audit-log";
import { migrateLegacyMarkersToPortfolio } from "@/lib/legacy-migration";
import {
  importAuthorizedGoogleStreetView,
} from "@/lib/google-streetview-import";
import {
  listTenantAssets,
  resolveTenantId,
  saveImportRun,
} from "@/lib/tenant-store";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";

const REQUIRED_SCOPES: Scope[] = ["legacy:import"];

interface GoogleStreetViewImportPayload {
  tenantId?: unknown;
  maxAssets?: unknown;
  headings?: unknown;
  radiusMeters?: unknown;
  fov?: unknown;
  pitch?: unknown;
  detectionThreshold?: unknown;
  assetMatchRadiusKm?: unknown;
}

function allowPublicImport(): boolean {
  return (
    process.env.ALLOW_PUBLIC_GOOGLE_IMPORT === "true" ||
    process.env.NODE_ENV !== "production"
  );
}

function resolveAuth(request: Request): AuthContext {
  try {
    return authorizeRequest(request, REQUIRED_SCOPES);
  } catch (error) {
    if (error instanceof AuthError && allowPublicImport()) {
      return {
        actorId: "public-google-import",
        tenant: "public",
        authMethod: "api_key",
        scopes: REQUIRED_SCOPES,
        role: "public",
      };
    }
    throw error;
  }
}

export async function POST(request: Request) {
  try {
    const auth = resolveAuth(request);
    enforceRateLimit(
      request,
      {
        keyPrefix: "import-google-streetview",
        maxRequests: auth.actorId.startsWith("public-") ? 4 : 12,
        windowMs: 60_000,
      },
      auth.actorId,
    );

    let payload: GoogleStreetViewImportPayload = {};
    try {
      payload = (await request.json()) as GoogleStreetViewImportPayload;
    } catch {
      payload = {};
    }

    const tenantId = await resolveTenantId(
      typeof payload.tenantId === "string" ? payload.tenantId.trim() : undefined,
    );
    const assets = await listTenantAssets(tenantId);
    if (assets.length === 0) {
      return NextResponse.json(
        {
          error:
            "No assets found for tenant. Import asset registry first before Google Street View ingestion.",
        },
        { status: 400 },
      );
    }

    const headings = Array.isArray(payload.headings)
      ? payload.headings
          .map((item) => Number(item))
          .filter((item) => Number.isFinite(item))
      : undefined;
    const collected = await importAuthorizedGoogleStreetView({
      assets,
      maxAssets: Number(payload.maxAssets ?? 250),
      headings,
      radiusMeters: Number(payload.radiusMeters ?? 120),
      fov: Number(payload.fov ?? 90),
      pitch: Number(payload.pitch ?? 0),
      detectionThreshold: Number(payload.detectionThreshold ?? 0.72),
    });
    if (collected.markers.length === 0) {
      return NextResponse.json(
        {
          error:
            "No detections produced from Google imagery. Review diagnostics and lower threshold only if necessary.",
          google: collected.diagnostics,
          warnings: collected.warnings,
        },
        { status: 422 },
      );
    }

    const assetMatchRadiusKm = Number(payload.assetMatchRadiusKm ?? 0.5);
    const migrated = migrateLegacyMarkersToPortfolio(collected.markers, {
      assets,
      assetMatchRadiusKm: Number.isFinite(assetMatchRadiusKm)
        ? Math.min(Math.max(assetMatchRadiusKm, 0.2), 5)
        : 0.5,
    });
    migrated.warnings.push(...collected.warnings);

    const run = await saveImportRun({
      tenantId,
      source: "google-streetview",
      authMode: auth.authMethod,
      actorId: auth.actorId,
      warnings: migrated.warnings,
      ingestion: migrated.ingestion,
      coverage: migrated.coverage,
      summary: migrated.summary,
    });

    await logAuditEvent({
      action: "import.google-streetview",
      status: "success",
      actorId: auth.actorId,
      actorEmail: auth.actorEmail,
      tenant: tenantId,
      authMethod: auth.authMethod,
      request,
      details: {
        runId: run.id,
        tenantId,
        maxAssets: Number(payload.maxAssets ?? 250),
        markersGenerated: collected.diagnostics.markersGenerated,
      },
    });

    return NextResponse.json({
      tenantId,
      runId: run.id,
      importedAt: run.createdAt,
      google: collected.diagnostics,
      ...migrated,
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
        error:
          error instanceof Error
            ? error.message
            : "Google Street View import failed.",
      },
      { status: 500 },
    );
  }
}
