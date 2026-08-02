import { NextResponse } from "next/server";
import {
  AuthError,
  authorizeRequest,
  type Scope,
} from "@/lib/enterprise-auth";
import { logAuditEvent } from "@/lib/audit-log";
import { fetchFirestoreMarkers } from "@/lib/firestore-markers";
import { migrateLegacyMarkersToPortfolio } from "@/lib/legacy-migration";

const REQUIRED_SCOPES: Scope[] = ["legacy:import", "firestore:read"];

interface FirestoreImportPayload {
  limit?: unknown;
  updatedAfter?: unknown;
}

export async function POST(request: Request) {
  try {
    const auth = authorizeRequest(request, REQUIRED_SCOPES);
    let payload: FirestoreImportPayload = {};
    try {
      payload = (await request.json()) as FirestoreImportPayload;
    } catch {
      payload = {};
    }

    const limitRaw = Number(payload.limit ?? 10_000);
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(Math.floor(limitRaw), 1), 50_000)
      : 10_000;
    const updatedAfter =
      typeof payload.updatedAfter === "string" && payload.updatedAfter.length > 0
        ? payload.updatedAfter
        : undefined;

    const fetched = await fetchFirestoreMarkers({ limit, updatedAfter });
    const migrated = migrateLegacyMarkersToPortfolio(fetched.markers);
    if (fetched.invalidRows > 0) {
      migrated.warnings.push(
        `${fetched.invalidRows} Firestore rows could not be normalized and were skipped.`,
      );
    }

    await logAuditEvent({
      action: "import.firestore-markers",
      status: "success",
      actorId: auth.actorId,
      actorEmail: auth.actorEmail,
      tenant: auth.tenant,
      authMethod: auth.authMethod,
      request,
      details: {
        limit,
        updatedAfter: updatedAfter ?? null,
        totalFetched: fetched.totalFetched,
        importedMarkers: migrated.ingestion.markersAccepted,
      },
    });

    return NextResponse.json({
      source: "firestore",
      fetch: {
        totalFetched: fetched.totalFetched,
        normalizedMarkers: fetched.markers.length,
        invalidRows: fetched.invalidRows,
      },
      ...migrated,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      await logAuditEvent({
        action: "import.firestore-markers",
        status: "denied",
        actorId: "unauthorized",
        request,
        details: { reason: error.message },
      });
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    await logAuditEvent({
      action: "import.firestore-markers",
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
            : "Failed to import markers from Firestore.",
      },
      { status: 500 },
    );
  }
}

