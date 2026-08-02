import { NextResponse } from "next/server";
import {
  AuthError,
  authorizeRequest,
  type Scope,
} from "@/lib/enterprise-auth";
import { logAuditEvent } from "@/lib/audit-log";
import {
  isValidLegacyMarker,
  type LegacyMarker,
} from "@/lib/legacy-model";
import { migrateLegacyMarkersToPortfolio } from "@/lib/legacy-migration";

interface ImportPayload {
  markers?: unknown;
}

const REQUIRED_SCOPES: Scope[] = ["legacy:import"];

export async function POST(request: Request) {
  try {
    const auth = authorizeRequest(request, REQUIRED_SCOPES);
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

    if (payload.markers.length > 50_000) {
      return NextResponse.json(
        { error: "markers array exceeds 50,000 record limit for preview ingestion." },
        { status: 413 },
      );
    }

    const filtered = payload.markers.filter(isValidLegacyMarker) as LegacyMarker[];
    const result = migrateLegacyMarkersToPortfolio(filtered);

    await logAuditEvent({
      action: "import.legacy-markers",
      status: "success",
      actorId: auth.actorId,
      actorEmail: auth.actorEmail,
      tenant: auth.tenant,
      authMethod: auth.authMethod,
      request,
      details: {
        received: payload.markers.length,
        accepted: filtered.length,
      },
    });

    return NextResponse.json(result);
  } catch (error) {
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
