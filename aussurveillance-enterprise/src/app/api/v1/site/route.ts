import { NextResponse } from "next/server";
import {
  AuthError,
  authorizeRequest,
  type Scope,
} from "@/lib/enterprise-auth";
import { logAuditEvent } from "@/lib/audit-log";
import { fetchPortfolioData } from "@/lib/portfolio-data";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";

const REQUIRED_SCOPES: Scope[] = ["site:read"];

export async function GET(request: Request) {
  try {
    const auth = authorizeRequest(request, REQUIRED_SCOPES);
    enforceRateLimit(
      request,
      {
        keyPrefix: "site-read",
        maxRequests: 120,
        windowMs: 60_000,
      },
      auth.actorId,
    );
    const url = new URL(request.url);
    const siteId = url.searchParams.get("siteId");
    if (!siteId) {
      return NextResponse.json(
        {
          error: "siteId query parameter is required.",
        },
        { status: 400 },
      );
    }
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
    const site = result.summary.sites.find((item) => item.site.id === siteId);
    if (!site) {
      return NextResponse.json(
        {
          error: `No site found for siteId ${siteId}.`,
        },
        { status: 404 },
      );
    }

    await logAuditEvent({
      action: "site.read",
      status: "success",
      actorId: auth.actorId,
      actorEmail: auth.actorEmail,
      tenant: auth.tenant,
      authMethod: auth.authMethod,
      request,
      details: { siteId, source, tenantId: tenantId ?? null, limit },
    });

    return NextResponse.json({
      source: result.source,
      warnings: result.warnings,
      tenantId: result.tenantId,
      runId: result.runId,
      importedAt: result.importedAt,
      site,
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
        action: "site.read",
        status: "denied",
        actorId: "unauthorized",
        request,
        details: { reason: error.message },
      });
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    await logAuditEvent({
      action: "site.read",
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
            : "Failed to fetch site.",
      },
      { status: 500 },
    );
  }
}
