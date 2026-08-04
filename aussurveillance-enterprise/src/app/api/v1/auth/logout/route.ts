import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, getSessionFromRequest } from "@/lib/enterprise-auth";
import { logAuditEvent } from "@/lib/audit-log";

export async function POST(request: Request) {
  const session = getSessionFromRequest(request);
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  await logAuditEvent({
    action: "auth.logout",
    status: "success",
    actorId: session?.sub ?? "anonymous",
    actorEmail: session?.email,
    tenant: session?.tenant,
    authMethod: "session",
    request,
  });

  return response;
}

