import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function applySecurityHeaders(response: NextResponse, isApi: boolean) {
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  response.headers.set("X-Permitted-Cross-Domain-Policies", "none");
  if (isApi) {
    response.headers.set("Cache-Control", "no-store");
  }
}

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const isApi = request.nextUrl.pathname.startsWith("/api/");
  applySecurityHeaders(response, isApi);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

