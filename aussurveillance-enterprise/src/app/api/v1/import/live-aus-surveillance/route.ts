import { NextResponse } from "next/server";
import {
  AuthError,
  authorizeRequest,
  type Scope,
} from "@/lib/enterprise-auth";
import { logAuditEvent } from "@/lib/audit-log";
import { fetchLivePublicMarkers } from "@/lib/live-aus-surveillance";
import { migrateLegacyMarkersToPortfolio } from "@/lib/legacy-migration";

const REQUIRED_SCOPES: Scope[] = ["legacy:import"];

interface LiveImportPayload {
  limit?: unknown;
  firebaseEmail?: unknown;
  firebasePassword?: unknown;
}

export async function POST(request: Request) {
  try {
    const auth = authorizeRequest(request, REQUIRED_SCOPES);
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

    await logAuditEvent({
      action: "import.live-aus-surveillance",
      status: "success",
      actorId: auth.actorId,
      actorEmail: auth.actorEmail,
      tenant: auth.tenant,
      authMethod: auth.authMethod,
      request,
      details: {
        limit,
        authMode: fetched.authMode,
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
      ...migrated,
    });
  } catch (error) {
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

