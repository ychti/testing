import { NextResponse } from "next/server";
import {
  type AuthContext,
  AuthError,
  authorizeRequest,
  type Scope,
} from "@/lib/enterprise-auth";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";

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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parseNumber(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
}

function mapsApiKey(): string {
  return process.env.GOOGLE_MAPS_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim() || "";
}

function metadataUrl(input: {
  lat: number;
  lng: number;
  heading: number;
  fov: number;
  pitch: number;
  radius: number;
  apiKey: string;
}) {
  const params = new URLSearchParams({
    location: `${input.lat},${input.lng}`,
    heading: String(input.heading),
    fov: String(input.fov),
    pitch: String(input.pitch),
    radius: String(input.radius),
    key: input.apiKey,
  });
  return `https://maps.googleapis.com/maps/api/streetview/metadata?${params.toString()}`;
}

function imageUrl(input: {
  lat: number;
  lng: number;
  heading: number;
  fov: number;
  pitch: number;
  radius: number;
  size: string;
  apiKey: string;
}) {
  const params = new URLSearchParams({
    location: `${input.lat},${input.lng}`,
    heading: String(input.heading),
    fov: String(input.fov),
    pitch: String(input.pitch),
    radius: String(input.radius),
    size: input.size,
    key: input.apiKey,
  });
  return `https://maps.googleapis.com/maps/api/streetview?${params.toString()}`;
}

export async function GET(request: Request) {
  try {
    const auth = resolveAuth(
      request,
      READ_SCOPES,
      "public-review-preview",
      allowPublicRead(),
    );
    enforceRateLimit(
      request,
      {
        keyPrefix: "review-candidates-preview",
        maxRequests: 180,
        windowMs: 60_000,
      },
      auth.actorId,
    );

    const url = new URL(request.url);
    const lat = parseNumber(url.searchParams.get("lat"));
    const lng = parseNumber(url.searchParams.get("lng"));
    if (
      lat === null ||
      lng === null ||
      Math.abs(lat) > 90 ||
      Math.abs(lng) > 180
    ) {
      return NextResponse.json(
        { error: "lat and lng query parameters are required." },
        { status: 400 },
      );
    }

    const headingRaw = parseNumber(url.searchParams.get("heading"));
    const heading =
      headingRaw === null
        ? 0
        : ((Math.round(headingRaw) % 360) + 360) % 360;
    const fov = clamp(parseNumber(url.searchParams.get("fov")) ?? 90, 15, 120);
    const pitch = clamp(parseNumber(url.searchParams.get("pitch")) ?? 0, -60, 60);
    const radius = clamp(
      parseNumber(url.searchParams.get("radius")) ?? 300,
      5,
      1000,
    );
    const size = url.searchParams.get("size") ?? "640x640";

    const apiKey = mapsApiKey();
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "Server is missing GOOGLE_MAPS_API_KEY (or GOOGLE_API_KEY). Add it to .env.local and restart dev server.",
        },
        { status: 503 },
      );
    }

    const metadataResponse = await fetch(
      metadataUrl({ lat, lng, heading, fov, pitch, radius, apiKey }),
      { cache: "no-store" },
    );
    const metadataPayload = (await metadataResponse.json().catch(() => null)) as
      | { status?: string; error_message?: string }
      | null;
    if (!metadataResponse.ok || metadataPayload?.status !== "OK") {
      return NextResponse.json(
        {
          error:
            metadataPayload?.error_message ??
            `Street View metadata status: ${metadataPayload?.status ?? metadataResponse.status}`,
        },
        { status: 404 },
      );
    }

    const upstream = await fetch(
      imageUrl({ lat, lng, heading, fov, pitch, radius, size, apiKey }),
      { cache: "no-store" },
    );
    if (!upstream.ok) {
      return NextResponse.json(
        { error: "Failed to fetch Street View image." },
        { status: 502 },
      );
    }
    const contentType = upstream.headers.get("content-type") || "image/jpeg";
    const bytes = await upstream.arrayBuffer();
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store, max-age=0",
      },
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
            : "Failed to load Street View preview.",
      },
      { status: 500 },
    );
  }
}
