import { NextResponse } from "next/server";
import {
  AuthError,
  authorizeRequest,
  type Scope,
} from "@/lib/enterprise-auth";
import { logAuditEvent, readRecentAuditEvents } from "@/lib/audit-log";

const REQUIRED_SCOPES: Scope[] = ["audit:read"];

export async function GET(request: Request) {
  try {
    const auth = authorizeRequest(request, REQUIRED_SCOPES);
    const url = new URL(request.url);
    const limitRaw = Number(url.searchParams.get("limit") ?? 100);
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(Math.floor(limitRaw), 1), 500)
      : 100;
    const events = await readRecentAuditEvents(limit);

    await logAuditEvent({
      action: "audit.read",
      status: "success",
      actorId: auth.actorId,
      actorEmail: auth.actorEmail,
      tenant: auth.tenant,
      authMethod: auth.authMethod,
      request,
      details: { limit, returned: events.length },
    });

    return NextResponse.json({
      count: events.length,
      events,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      await logAuditEvent({
        action: "audit.read",
        status: "denied",
        actorId: "unauthorized",
        request,
        details: { reason: error.message },
      });
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    await logAuditEvent({
      action: "audit.read",
      status: "error",
      actorId: "system",
      request,
      details: { message: error instanceof Error ? error.message : "unknown" },
    });
    return NextResponse.json(
      { error: "Failed to read audit events." },
      { status: 500 },
    );
  }
}

