import { NextResponse } from "next/server";
import {
  AuthError,
  authorizeRequest,
  type Scope,
} from "@/lib/enterprise-auth";
import { logAuditEvent } from "@/lib/audit-log";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { migrateLegacyMarkersToPortfolio } from "@/lib/legacy-migration";
import {
  collectApprovedReviewMarkers,
  listTenantAssets,
  markReviewCandidatesExported,
  resolveTenantId,
  saveImportRun,
} from "@/lib/tenant-store";

interface ImportApprovedPayload {
  tenantId?: unknown;
  limit?: unknown;
  unexportedOnly?: unknown;
}

const REQUIRED_SCOPES: Scope[] = ["legacy:import"];

export async function POST(request: Request) {
  try {
    const auth = authorizeRequest(request, REQUIRED_SCOPES);
    enforceRateLimit(
      request,
      {
        keyPrefix: "import-review-approved",
        maxRequests: 20,
        windowMs: 60_000,
      },
      auth.actorId,
    );
    let payload: ImportApprovedPayload = {};
    try {
      payload = (await request.json()) as ImportApprovedPayload;
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON payload." },
        { status: 400 },
      );
    }
    const tenantId = await resolveTenantId(
      typeof payload.tenantId === "string" ? payload.tenantId.trim() : undefined,
    );
    const limit = Number(payload.limit);
    const approved = await collectApprovedReviewMarkers({
      tenantId,
      limit: Number.isFinite(limit) ? Math.max(Math.floor(limit), 1) : 50_000,
      unexportedOnly: payload.unexportedOnly !== false,
    });
    if (approved.markers.length === 0) {
      return NextResponse.json(
        { error: "No approved review markers available for import." },
        { status: 400 },
      );
    }
    const assets = await listTenantAssets(tenantId);
    const result = migrateLegacyMarkersToPortfolio(approved.markers, { assets });
    const run = await saveImportRun({
      tenantId,
      source: "review-approved",
      authMode: auth.authMethod,
      actorId: auth.actorId,
      warnings: result.warnings,
      ingestion: result.ingestion,
      coverage: result.coverage,
      summary: result.summary,
    });
    await markReviewCandidatesExported(tenantId, approved.candidateIds);

    await logAuditEvent({
      action: "import.review-approved",
      status: "success",
      actorId: auth.actorId,
      actorEmail: auth.actorEmail,
      tenant: auth.tenant,
      authMethod: auth.authMethod,
      request,
      details: {
        tenantId: run.tenantId,
        runId: run.id,
        imported: approved.markers.length,
        unexportedOnly: payload.unexportedOnly !== false,
      },
    });

    return NextResponse.json({
      ...result,
      tenantId: run.tenantId,
      runId: run.id,
      importedAt: run.createdAt,
      importedMarkers: approved.markers.length,
      queueStats: approved.stats,
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
        action: "import.review-approved",
        status: "denied",
        actorId: "unauthorized",
        request,
        details: { reason: error.message },
      });
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    await logAuditEvent({
      action: "import.review-approved",
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
            : "Approved review import failed.",
      },
      { status: 500 },
    );
  }
}
