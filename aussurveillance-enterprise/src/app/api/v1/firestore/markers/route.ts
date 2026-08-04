import { NextResponse } from "next/server";
import {
  AuthError,
  authorizeRequest,
  type Scope,
} from "@/lib/enterprise-auth";
import { logAuditEvent } from "@/lib/audit-log";
import { fetchFirestoreMarkers } from "@/lib/firestore-markers";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";

const REQUIRED_SCOPES: Scope[] = ["firestore:read"];

export async function GET(request: Request) {
  try {
    const auth = authorizeRequest(request, REQUIRED_SCOPES);
    enforceRateLimit(
      request,
      {
        keyPrefix: "firestore-markers-read",
        maxRequests: 20,
        windowMs: 60_000,
      },
      auth.actorId,
    );
    const url = new URL(request.url);
    const limitRaw = Number(url.searchParams.get("limit") ?? 5000);
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(Math.floor(limitRaw), 1), 50_000)
      : 5000;
    const updatedAfter = url.searchParams.get("updatedAfter") ?? undefined;
    const fetched = await fetchFirestoreMarkers({ limit, updatedAfter });

    await logAuditEvent({
      action: "firestore.markers.read",
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
        validMarkers: fetched.markers.length,
        invalidRows: fetched.invalidRows,
      },
    });

    return NextResponse.json({
      ...fetched,
      requestedLimit: limit,
      updatedAfter: updatedAfter ?? null,
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      await logAuditEvent({
        action: "firestore.markers.read",
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
        action: "firestore.markers.read",
        status: "denied",
        actorId: "unauthorized",
        request,
        details: { reason: error.message },
      });
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    await logAuditEvent({
      action: "firestore.markers.read",
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
            : "Failed to fetch markers from Firestore.",
      },
      { status: 500 },
    );
  }
}

