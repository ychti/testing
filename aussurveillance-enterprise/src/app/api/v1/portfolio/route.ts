import { NextResponse } from "next/server";
import {
  AuthError,
  authorizeRequest,
  type Scope,
} from "@/lib/enterprise-auth";
import { logAuditEvent } from "@/lib/audit-log";
import { fetchPortfolioData } from "@/lib/portfolio-data";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";

const REQUIRED_SCOPES: Scope[] = ["portfolio:read"];

export async function GET(request: Request) {
  try {
    const auth = authorizeRequest(request, REQUIRED_SCOPES);
    enforceRateLimit(
      request,
      {
        keyPrefix: "portfolio-read",
        maxRequests: 80,
        windowMs: 60_000,
      },
      auth.actorId,
    );
    const url = new URL(request.url);
    const sourceParam = url.searchParams.get("source");
    const source =
      sourceParam === "firestore"
        ? "firestore"
        : sourceParam === "snapshot"
          ? "snapshot"
          : "mock";
    const limitRaw = Number(url.searchParams.get("limit") ?? 10_000);
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(Math.floor(limitRaw), 1), 50_000)
      : 10_000;
    const updatedAfter = url.searchParams.get("updatedAfter") ?? undefined;
    const tenantId = url.searchParams.get("tenantId") ?? undefined;

    const result = await fetchPortfolioData({
      source,
      limit,
      updatedAfter,
      tenantId,
    });

    await logAuditEvent({
      action: "portfolio.read",
      status: "success",
      actorId: auth.actorId,
      actorEmail: auth.actorEmail,
      tenant: auth.tenant,
      authMethod: auth.authMethod,
      request,
      details: {
        source,
        tenantId: tenantId ?? null,
        limit,
        updatedAfter: updatedAfter ?? null,
      },
    });

    return NextResponse.json(result);
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
        action: "portfolio.read",
        status: "denied",
        actorId: "unauthorized",
        request,
        details: { reason: error.message },
      });
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    await logAuditEvent({
      action: "portfolio.read",
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
            : "Failed to fetch portfolio summary.",
      },
      { status: 500 },
    );
  }
}
