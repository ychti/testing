import { NextResponse } from "next/server";
import {
  type AuthContext,
  AuthError,
  authorizeRequest,
  type Scope,
} from "@/lib/enterprise-auth";
import { logAuditEvent } from "@/lib/audit-log";
import { createTenant, listTenants } from "@/lib/tenant-store";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";

const READ_SCOPES: Scope[] = ["tenant:read"];
const WRITE_SCOPES: Scope[] = ["tenant:write"];

interface CreateTenantPayload {
  name?: unknown;
  industry?: unknown;
  ownerEmail?: unknown;
}

function allowPublicTenantRead(): boolean {
  return (
    process.env.ALLOW_PUBLIC_TENANT_READ === "true" ||
    process.env.NODE_ENV !== "production"
  );
}

function allowPublicTenantWrite(): boolean {
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

export async function GET(request: Request) {
  try {
    const auth = resolveAuth(
      request,
      READ_SCOPES,
      "public-tenant-read",
      allowPublicTenantRead(),
    );
    enforceRateLimit(
      request,
      {
        keyPrefix: "tenants-read",
        maxRequests: 60,
        windowMs: 60_000,
      },
      auth.actorId,
    );
    const tenants = await listTenants();

    await logAuditEvent({
      action: "tenants.read",
      status: "success",
      actorId: auth.actorId,
      actorEmail: auth.actorEmail,
      tenant: auth.tenant,
      authMethod: auth.authMethod,
      request,
      details: { count: tenants.length },
    });

    return NextResponse.json({
      count: tenants.length,
      tenants,
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
        error: error instanceof Error ? error.message : "Failed to list tenants.",
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
      "public-tenant-write",
      allowPublicTenantWrite(),
    );
    enforceRateLimit(
      request,
      {
        keyPrefix: "tenants-write",
        maxRequests: 25,
        windowMs: 60_000,
      },
      auth.actorId,
    );

    let payload: CreateTenantPayload;
    try {
      payload = (await request.json()) as CreateTenantPayload;
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON payload." },
        { status: 400 },
      );
    }

    const name = typeof payload.name === "string" ? payload.name.trim() : "";
    if (name.length < 3) {
      return NextResponse.json(
        { error: "Tenant name must be at least 3 characters." },
        { status: 400 },
      );
    }

    const tenant = await createTenant({
      name,
      industry:
        typeof payload.industry === "string" ? payload.industry.trim() : undefined,
      ownerEmail:
        typeof payload.ownerEmail === "string"
          ? payload.ownerEmail.trim()
          : undefined,
    });

    await logAuditEvent({
      action: "tenants.create",
      status: "success",
      actorId: auth.actorId,
      actorEmail: auth.actorEmail,
      tenant: tenant.id,
      authMethod: auth.authMethod,
      request,
      details: { name: tenant.name },
    });

    return NextResponse.json({ tenant }, { status: 201 });
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
        error: error instanceof Error ? error.message : "Failed to create tenant.",
      },
      { status: 500 },
    );
  }
}

