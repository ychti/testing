import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/enterprise-auth";

export async function GET(request: Request) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ authenticated: false });
  }
  return NextResponse.json({
    authenticated: true,
    actorId: session.sub,
    email: session.email,
    role: session.role,
    tenant: session.tenant,
    scopes: session.scopes,
    exp: session.exp,
  });
}

