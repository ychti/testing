import { NextResponse } from "next/server";
import {
  SESSION_COOKIE_NAME,
  createSessionPayload,
  createSessionToken,
  validateOperatorCredentials,
} from "@/lib/enterprise-auth";
import { logAuditEvent } from "@/lib/audit-log";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";

interface LoginPayload {
  email?: unknown;
  password?: unknown;
}

export async function POST(request: Request) {
  try {
    enforceRateLimit(request, {
      keyPrefix: "auth-login",
      maxRequests: 20,
      windowMs: 60_000,
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
  }

  let payload: LoginPayload;
  try {
    payload = (await request.json()) as LoginPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const email = typeof payload.email === "string" ? payload.email.trim() : "";
  const password =
    typeof payload.password === "string" ? payload.password : "";

  if (!email || !password) {
    return NextResponse.json(
      { error: "email and password are required." },
      { status: 400 },
    );
  }

  const isValid = validateOperatorCredentials(email, password);
  if (!isValid) {
    await logAuditEvent({
      action: "auth.login",
      status: "denied",
      actorId: `operator:${email.toLowerCase()}`,
      actorEmail: email.toLowerCase(),
      request,
    });
    return NextResponse.json(
      { error: "Invalid operator credentials." },
      { status: 401 },
    );
  }

  const sessionPayload = createSessionPayload(email);
  const token = createSessionToken(sessionPayload);
  const response = NextResponse.json({
    ok: true,
    actorId: sessionPayload.sub,
    email: sessionPayload.email,
    role: sessionPayload.role,
    scopes: sessionPayload.scopes,
  });
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });

  await logAuditEvent({
    action: "auth.login",
    status: "success",
    actorId: sessionPayload.sub,
    actorEmail: sessionPayload.email,
    tenant: sessionPayload.tenant,
    authMethod: "session",
    request,
  });

  return response;
}

