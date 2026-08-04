import { NextResponse } from "next/server";
import {
  type AuthContext,
  AuthError,
  authorizeRequest,
  type Scope,
} from "@/lib/enterprise-auth";
import { getTenantTrend } from "@/lib/tenant-store";
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
        actorId: "public-portfolio-trend-read",
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
        keyPrefix: "portfolio-trend-read",
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
    const limitRaw = Number(url.searchParams.get("limit") ?? 20);
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(Math.floor(limitRaw), 2), 200)
      : 20;
    const points = await getTenantTrend(tenantId, limit);
    return NextResponse.json({
      tenantId,
      count: points.length,
      points,
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
            : "Failed to fetch portfolio trend.",
      },
      { status: 500 },
    );
  }
}

