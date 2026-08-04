import { NextResponse } from "next/server";
import {
  type AuthContext,
  AuthError,
  authorizeRequest,
  type Scope,
} from "@/lib/enterprise-auth";
import { logAuditEvent } from "@/lib/audit-log";
import { migrateLegacyMarkersToPortfolio } from "@/lib/legacy-migration";
import { importOfficialStateFeeds } from "@/lib/official-state-feeds";
import {
  listTenantAssets,
  resolveTenantId,
  saveImportRun,
} from "@/lib/tenant-store";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";

const REQUIRED_SCOPES: Scope[] = ["legacy:import"];

interface OfficialFeedPayload {
  states?: unknown;
  tenantId?: unknown;
  assetMatchRadiusKm?: unknown;
}

function allowPublicImport(): boolean {
  return (
    process.env.ALLOW_PUBLIC_LIVE_IMPORT === "true" ||
    process.env.NODE_ENV !== "production"
  );
}

function resolveAuth(request: Request): AuthContext {
  try {
    return authorizeRequest(request, REQUIRED_SCOPES);
  } catch (error) {
    if (error instanceof AuthError && allowPublicImport()) {
      return {
        actorId: "public-official-feed-import",
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
        keyPrefix: "import-official-feeds",
        maxRequests: auth.actorId.startsWith("public-") ? 6 : 15,
        windowMs: 60_000,
      },
      auth.actorId,
    );

    let payload: OfficialFeedPayload = {};
    try {
      payload = (await request.json()) as OfficialFeedPayload;
    } catch {
      payload = {};
    }

    const states = Array.isArray(payload.states)
      ? payload.states
          .map((state) => String(state ?? "").trim().toUpperCase())
          .filter((state) => state.length > 0)
      : undefined;
    const tenantId = await resolveTenantId(
      typeof payload.tenantId === "string" ? payload.tenantId.trim() : undefined,
    );
    const assets = await listTenantAssets(tenantId);
    const assetMatchRadiusKmRaw = Number(payload.assetMatchRadiusKm ?? 1.2);
    const assetMatchRadiusKm = Number.isFinite(assetMatchRadiusKmRaw)
      ? Math.min(Math.max(assetMatchRadiusKmRaw, 0.2), 5)
      : 1.2;

    const officialFeed = await importOfficialStateFeeds(states);
    const migrated = migrateLegacyMarkersToPortfolio(officialFeed.markers, {
      assets,
      assetMatchRadiusKm,
    });
    migrated.warnings.push(...officialFeed.warnings);
    if (officialFeed.statuses.some((status) => status.status === "error")) {
      migrated.warnings.push(
        "At least one official state feed failed. Review feed status output and retry those states.",
      );
    }

    const run = await saveImportRun({
      tenantId,
      source: "official-state-feeds",
      authMode: auth.authMethod,
      actorId: auth.actorId,
      warnings: migrated.warnings,
      ingestion: migrated.ingestion,
      coverage: migrated.coverage,
      summary: migrated.summary,
    });

    await logAuditEvent({
      action: "import.official-state-feeds",
      status: "success",
      actorId: auth.actorId,
      actorEmail: auth.actorEmail,
      tenant: tenantId,
      authMethod: auth.authMethod,
      request,
      details: {
        runId: run.id,
        tenantId,
        requestedStates: states ?? "all",
        assetCount: assets.length,
        markerCount: officialFeed.markers.length,
      },
    });

    return NextResponse.json({
      tenantId,
      runId: run.id,
      importedAt: run.createdAt,
      feedStatus: officialFeed.statuses,
      feedMarkerCount: officialFeed.markers.length,
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
            : "Official feed import failed.",
      },
      { status: 500 },
    );
  }
}
