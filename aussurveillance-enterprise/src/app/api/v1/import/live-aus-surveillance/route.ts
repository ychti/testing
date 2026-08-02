import { NextResponse } from "next/server";
import {
  AuthContext,
  AuthError,
  authorizeRequest,
  type Scope,
} from "@/lib/enterprise-auth";
import { logAuditEvent } from "@/lib/audit-log";
import { fetchLivePublicMarkers } from "@/lib/live-aus-surveillance";
import { migrateLegacyMarkersToPortfolio } from "@/lib/legacy-migration";
import { saveImportRun } from "@/lib/tenant-store";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";

const REQUIRED_SCOPES: Scope[] = ["legacy:import"];

interface LiveImportPayload {
  limit?: unknown;
  firebaseEmail?: unknown;
  firebasePassword?: unknown;
  tenantId?: unknown;
}

function allowPublicLiveImport(): boolean {
  return (
    process.env.ALLOW_PUBLIC_LIVE_IMPORT === "true" ||
    process.env.NODE_ENV !== "production"
  );
}

export async function POST(request: Request) {
  try {
    let auth: AuthContext = {
      actorId: "public-import",
      tenant: "public",
      authMethod: "api_key",
      scopes: ["legacy:import"],
      role: "public",
    };
    try {
      auth = authorizeRequest(request, REQUIRED_SCOPES);
    } catch (authError) {
      if (!(authError instanceof AuthError)) {
        throw authError;
      }
      if (!allowPublicLiveImport()) {
        throw authError;
      }
    }
    enforceRateLimit(
      request,
      {
        keyPrefix: "import-live",
        maxRequests: auth.actorId === "public-import" ? 6 : 20,
        windowMs: 60_000,
      },
      auth.actorId,
    );

    let payload: LiveImportPayload = {};
    try {
      payload = (await request.json()) as LiveImportPayload;
    } catch {
      payload = {};
    }

    const limitRaw = Number(payload.limit ?? 10_000);
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(Math.floor(limitRaw), 1), 50_000)
      : 10_000;
    const firebaseEmail =
      typeof payload.firebaseEmail === "string" ? payload.firebaseEmail : undefined;
    const firebasePassword =
      typeof payload.firebasePassword === "string"
        ? payload.firebasePassword
        : undefined;
    const tenantId =
      typeof payload.tenantId === "string" ? payload.tenantId.trim() : undefined;

    const fetched = await fetchLivePublicMarkers({
      limit,
      firebaseEmail,
      firebasePassword,
    });
    const migrated = migrateLegacyMarkersToPortfolio(fetched.markers);
    if (fetched.invalidRows > 0) {
      migrated.warnings.push(
        `${fetched.invalidRows} public Firestore rows could not be normalized and were skipped.`,
      );
    }
    const run = await saveImportRun({
      tenantId,
      source: "live-public",
      authMode: fetched.authMode,
      actorId: auth.actorId,
      warnings: migrated.warnings,
      ingestion: migrated.ingestion,
      summary: migrated.summary,
    });

    await logAuditEvent({
      action: "import.live-aus-surveillance",
      status: "success",
      actorId: auth.actorId,
      actorEmail: auth.actorEmail,
      tenant: auth.tenant,
      authMethod: auth.authMethod,
      request,
      details: {
        tenantId: run.tenantId,
        runId: run.id,
        limit,
        authMode: fetched.authMode,
        requestedEmailFallback: Boolean(firebaseEmail),
        totalFetched: fetched.totalFetched,
        importedMarkers: migrated.ingestion.markersAccepted,
      },
    });

    return NextResponse.json({
      source: fetched.source,
      fetch: {
        totalFetched: fetched.totalFetched,
        normalizedMarkers: fetched.markers.length,
        invalidRows: fetched.invalidRows,
      },
      authMode: fetched.authMode,
      tenantId: run.tenantId,
      runId: run.id,
      importedAt: run.createdAt,
      ...migrated,
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      await logAuditEvent({
        action: "import.live-aus-surveillance",
        status: "denied",
        actorId: "rate-limited",
        request,
        details: { reason: error.message },
      });
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
        action: "import.live-aus-surveillance",
        status: "denied",
        actorId: "unauthorized",
        request,
        details: { reason: error.message },
      });
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    await logAuditEvent({
      action: "import.live-aus-surveillance",
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
            : "Failed to import live AUS surveillance markers.",
      },
      { status: 500 },
    );
  }
}

