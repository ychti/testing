import { NextResponse } from "next/server";
import {
  type AuthContext,
  AuthError,
  authorizeRequest,
  type Scope,
} from "@/lib/enterprise-auth";
import { getLatestImportRun } from "@/lib/tenant-store";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";

const REQUIRED_SCOPES: Scope[] = ["portfolio:read", "tenant:read"];

function allowPublicRead(): boolean {
  return (
    process.env.ALLOW_PUBLIC_TENANT_READ === "true" ||
    process.env.NODE_ENV !== "production"
  );
}

function resolveAuth(request: Request): AuthContext {
  try {
    return authorizeRequest(request, REQUIRED_SCOPES);
  } catch (error) {
    if (error instanceof AuthError && allowPublicRead()) {
      return {
        actorId: "public-portfolio-latest-read",
        tenant: "public",
        authMethod: "api_key",
        scopes: REQUIRED_SCOPES,
        role: "public",
      };
    }
    throw error;
  }
}

export async function GET(request: Request) {
  try {
    const auth = resolveAuth(request);
    enforceRateLimit(
      request,
      {
        keyPrefix: "portfolio-latest-read",
        maxRequests: 60,
        windowMs: 60_000,
      },
      auth.actorId,
    );
    const url = new URL(request.url);
    const tenantId = url.searchParams.get("tenantId");
    if (!tenantId) {
      return NextResponse.json(
        { error: "tenantId query parameter is required." },
        { status: 400 },
      );
    }
    const latest = await getLatestImportRun(tenantId);
    if (!latest) {
      return NextResponse.json(
        { error: `No imported portfolio snapshot for tenant ${tenantId}.` },
        { status: 404 },
      );
    }

    return NextResponse.json({
      tenantId,
      runId: latest.id,
      source: latest.source,
      authMode: latest.authMode ?? "unknown",
      importedAt: latest.createdAt,
      ingestion: latest.ingestion,
      warnings: latest.warnings,
      summary: latest.summary,
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
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch latest portfolio snapshot.",
      },
      { status: 500 },
    );
  }
}

