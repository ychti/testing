import { NextResponse } from "next/server";
import {
  type AuthContext,
  AuthError,
  authorizeRequest,
  type Scope,
} from "@/lib/enterprise-auth";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { collectApprovedReviewMarkers, resolveTenantId } from "@/lib/tenant-store";

const READ_SCOPES: Scope[] = ["tenant:read"];

function allowPublicRead(): boolean {
  return (
    process.env.ALLOW_PUBLIC_TENANT_READ === "true" ||
    process.env.NODE_ENV !== "production"
  );
}

function resolveAuth(
  request: Request,
  scopes: Scope[],
  fallbackActor: string,
  allowFallback: boolean,
): AuthContext {
  try {
    return authorizeRequest(request, scopes);
  } catch (error) {
    if (error instanceof AuthError && allowFallback) {
      return {
        actorId: fallbackActor,
        tenant: "public",
        authMethod: "api_key",
        scopes,
        role: "public",
      };
    }
    throw error;
  }
}

export async function GET(request: Request) {
  try {
    const auth = resolveAuth(
      request,
      READ_SCOPES,
      "public-review-read",
      allowPublicRead(),
    );
    enforceRateLimit(
      request,
      {
        keyPrefix: "review-candidates-export",
        maxRequests: 60,
        windowMs: 60_000,
      },
      auth.actorId,
    );
    const url = new URL(request.url);
    const tenantId = await resolveTenantId(url.searchParams.get("tenantId") ?? undefined);
    const limitRaw = Number(url.searchParams.get("limit") ?? 5000);
    const limit = Number.isFinite(limitRaw)
      ? Math.max(Math.min(Math.floor(limitRaw), 250_000), 1)
      : 5000;
    const unexportedOnly = url.searchParams.get("unexportedOnly") !== "false";
    const approved = await collectApprovedReviewMarkers({
      tenantId,
      limit,
      unexportedOnly,
    });
    return NextResponse.json({
      tenantId,
      count: approved.markers.length,
      unexportedOnly,
      stats: approved.stats,
      markers: approved.markers,
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
        error: error instanceof Error ? error.message : "Failed to export approved markers.",
      },
      { status: 500 },
    );
  }
}
