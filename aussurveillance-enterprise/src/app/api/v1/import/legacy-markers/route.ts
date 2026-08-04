import { NextResponse } from "next/server";
import {
  AuthError,
  authorizeRequest,
  type Scope,
} from "@/lib/enterprise-auth";
import { logAuditEvent } from "@/lib/audit-log";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import {
  isValidLegacyMarker,
  type LegacyMarker,
} from "@/lib/legacy-model";
import { migrateLegacyMarkersToPortfolio } from "@/lib/legacy-migration";
import {
  listTenantAssets,
  resolveTenantId,
  saveImportRun,
} from "@/lib/tenant-store";

interface ImportPayload {
  markers?: unknown;
  tenantId?: unknown;
}

const REQUIRED_SCOPES: Scope[] = ["legacy:import"];

export async function POST(request: Request) {
  try {
    const auth = authorizeRequest(request, REQUIRED_SCOPES);
    enforceRateLimit(
      request,
      {
        keyPrefix: "import-legacy",
        maxRequests: 20,
        windowMs: 60_000,
      },
      auth.actorId,
    );
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

    if (payload.markers.length > 250_000) {
      return NextResponse.json(
        { error: "markers array exceeds 250,000 record limit for preview ingestion." },
        { status: 413 },
      );
    }

    const filtered = payload.markers.filter(isValidLegacyMarker) as LegacyMarker[];
    const tenantId = await resolveTenantId(
      typeof payload.tenantId === "string" ? payload.tenantId.trim() : undefined,
    );
    const assets = await listTenantAssets(tenantId);
    const result = migrateLegacyMarkersToPortfolio(filtered, { assets });
    const run = await saveImportRun({
      tenantId,
      source: "legacy-file",
      authMode: auth.authMethod,
      actorId: auth.actorId,
      warnings: result.warnings,
      ingestion: result.ingestion,
      coverage: result.coverage,
      summary: result.summary,
    });

    await logAuditEvent({
      action: "import.legacy-markers",
      status: "success",
      actorId: auth.actorId,
      actorEmail: auth.actorEmail,
      tenant: auth.tenant,
      authMethod: auth.authMethod,
      request,
      details: {
        tenantId: run.tenantId,
        runId: run.id,
        received: payload.markers.length,
        accepted: filtered.length,
      },
    });

    return NextResponse.json({
      ...result,
      tenantId: run.tenantId,
      runId: run.id,
      importedAt: run.createdAt,
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
      await logAuditEvent({
        action: "import.legacy-markers",
        status: "denied",
        actorId: "unauthorized",
        request,
        details: { reason: error.message },
      });
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    await logAuditEvent({
      action: "import.legacy-markers",
      status: "error",
      actorId: "system",
      request,
      details: { message: error instanceof Error ? error.message : "unknown" },
    });
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Legacy import failed.",
      },
      { status: 500 },
    );
  }
}
