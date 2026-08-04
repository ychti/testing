import { NextResponse } from "next/server";
import {
  type AuthContext,
  AuthError,
  authorizeRequest,
  type Scope,
} from "@/lib/enterprise-auth";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import {
  getNextPendingReviewCandidate,
  getReviewQueueStats,
  resolveTenantId,
} from "@/lib/tenant-store";

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
        keyPrefix: "review-candidates-next",
        maxRequests: 120,
        windowMs: 60_000,
      },
      auth.actorId,
    );
    const url = new URL(request.url);
    const tenantId = await resolveTenantId(url.searchParams.get("tenantId") ?? undefined);
    const [stats, candidate] = await Promise.all([
      getReviewQueueStats(tenantId),
      getNextPendingReviewCandidate(tenantId),
    ]);
    return NextResponse.json({
      tenantId,
      stats,
      candidate,
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
        error: error instanceof Error ? error.message : "Failed to load review candidate.",
      },
      { status: 500 },
    );
  }
}
