import { NextResponse } from "next/server";
import {
  type AuthContext,
  AuthError,
  authorizeRequest,
  type Scope,
} from "@/lib/enterprise-auth";
import { logAuditEvent } from "@/lib/audit-log";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { isValidLegacyMarker, type LegacyMarker } from "@/lib/legacy-model";
import {
  decideReviewCandidate,
  enqueueReviewCandidates,
  getNextPendingReviewCandidate,
  getReviewQueueStats,
  listReviewCandidates,
  resolveTenantId,
  type ReviewCandidateRecord,
} from "@/lib/tenant-store";

const READ_SCOPES: Scope[] = ["tenant:read"];
const WRITE_SCOPES: Scope[] = ["tenant:write"];
const STATUS_VALUES: Array<ReviewCandidateRecord["status"]> = [
  "pending",
  "approved",
  "rejected",
];

interface QueuePayload {
  tenantId?: unknown;
  markers?: unknown;
  sourceLabel?: unknown;
  candidateId?: unknown;
  decision?: unknown;
  reviewerNote?: unknown;
}

function allowPublicRead(): boolean {
  return (
    process.env.ALLOW_PUBLIC_TENANT_READ === "true" ||
    process.env.NODE_ENV !== "production"
  );
}

function allowPublicWrite(): boolean {
  return (
    process.env.ALLOW_PUBLIC_TENANT_WRITE === "true" ||
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

function validMarkers(input: unknown): LegacyMarker[] {
  if (!Array.isArray(input)) {
    return [];
  }
  return input.filter(isValidLegacyMarker) as LegacyMarker[];
}

function parseStatus(value: string | null): ReviewCandidateRecord["status"] | undefined {
  if (!value) {
    return undefined;
  }
  if (STATUS_VALUES.includes(value as ReviewCandidateRecord["status"])) {
    return value as ReviewCandidateRecord["status"];
  }
  return undefined;
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
        keyPrefix: "review-candidates-read",
        maxRequests: 120,
        windowMs: 60_000,
      },
      auth.actorId,
    );

    const url = new URL(request.url);
    const tenantId = await resolveTenantId(url.searchParams.get("tenantId") ?? undefined);
    const status = parseStatus(url.searchParams.get("status"));
    const limitRaw = Number(url.searchParams.get("limit") ?? 40);
    const limit = Number.isFinite(limitRaw) ? Math.max(Math.min(limitRaw, 200), 1) : 40;
    const [stats, candidates, next] = await Promise.all([
      getReviewQueueStats(tenantId),
      listReviewCandidates({ tenantId, status, limit }),
      getNextPendingReviewCandidate(tenantId),
    ]);

    return NextResponse.json({
      tenantId,
      status: status ?? "all",
      count: candidates.length,
      stats,
      nextCandidateId: next?.id ?? null,
      candidates,
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
        error: error instanceof Error ? error.message : "Failed to load review candidates.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = resolveAuth(
      request,
      WRITE_SCOPES,
      "public-review-write",
      allowPublicWrite(),
    );
    enforceRateLimit(
      request,
      {
        keyPrefix: "review-candidates-write",
        maxRequests: 30,
        windowMs: 60_000,
      },
      auth.actorId,
    );

    let payload: QueuePayload;
    try {
      payload = (await request.json()) as QueuePayload;
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON payload." },
        { status: 400 },
      );
    }

    const rawMarkers = Array.isArray(payload.markers) ? payload.markers : [];
    const markers = validMarkers(rawMarkers);
    if (markers.length === 0) {
      return NextResponse.json(
        {
          error:
            "No valid markers found. Submit markers[] with lat,lng,type and optional CCTV metadata.",
        },
        { status: 400 },
      );
    }
    const tenantId = await resolveTenantId(
      typeof payload.tenantId === "string" ? payload.tenantId.trim() : undefined,
    );
    const queued = await enqueueReviewCandidates({
      tenantId,
      sourceLabel:
        typeof payload.sourceLabel === "string" ? payload.sourceLabel : undefined,
      submittedBy: auth.actorId,
      markers,
    });
    const next = await getNextPendingReviewCandidate(tenantId);

    await logAuditEvent({
      action: "review-candidates.enqueue",
      status: "success",
      actorId: auth.actorId,
      actorEmail: auth.actorEmail,
      tenant: tenantId,
      authMethod: auth.authMethod,
      request,
      details: {
        sourceLabel: payload.sourceLabel,
        received: rawMarkers.length,
        accepted: markers.length,
        created: queued.createdCount,
        skipped: queued.skippedCount,
      },
    });

    return NextResponse.json({
      tenantId,
      received: rawMarkers.length,
      accepted: markers.length,
      ...queued,
      nextCandidateId: next?.id ?? null,
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
        action: "review-candidates.enqueue",
        status: "denied",
        actorId: "unauthorized",
        request,
        details: { reason: error.message },
      });
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    await logAuditEvent({
      action: "review-candidates.enqueue",
      status: "error",
      actorId: "system",
      request,
      details: { message: error instanceof Error ? error.message : "unknown" },
    });
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to queue review markers.",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = resolveAuth(
      request,
      WRITE_SCOPES,
      "public-review-write",
      allowPublicWrite(),
    );
    enforceRateLimit(
      request,
      {
        keyPrefix: "review-candidates-decision",
        maxRequests: 120,
        windowMs: 60_000,
      },
      auth.actorId,
    );
    let payload: QueuePayload;
    try {
      payload = (await request.json()) as QueuePayload;
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON payload." },
        { status: 400 },
      );
    }
    const tenantId = await resolveTenantId(
      typeof payload.tenantId === "string" ? payload.tenantId.trim() : undefined,
    );
    const candidateId =
      typeof payload.candidateId === "string" ? payload.candidateId.trim() : "";
    if (!candidateId) {
      return NextResponse.json(
        { error: "candidateId is required." },
        { status: 400 },
      );
    }
    if (payload.decision !== "approve" && payload.decision !== "reject") {
      return NextResponse.json(
        { error: 'decision must be either "approve" or "reject".' },
        { status: 400 },
      );
    }
    const candidate = await decideReviewCandidate({
      tenantId,
      candidateId,
      decision: payload.decision,
      reviewerId: auth.actorId,
      reviewerNote:
        typeof payload.reviewerNote === "string" ? payload.reviewerNote : undefined,
    });
    const [stats, next] = await Promise.all([
      getReviewQueueStats(tenantId),
      getNextPendingReviewCandidate(tenantId),
    ]);
    await logAuditEvent({
      action: "review-candidates.decision",
      status: "success",
      actorId: auth.actorId,
      actorEmail: auth.actorEmail,
      tenant: tenantId,
      authMethod: auth.authMethod,
      request,
      details: {
        candidateId,
        decision: payload.decision,
      },
    });
    return NextResponse.json({
      tenantId,
      candidate,
      stats,
      nextCandidateId: next?.id ?? null,
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
        error: error instanceof Error ? error.message : "Failed to update review candidate.",
      },
      { status: 500 },
    );
  }
}
