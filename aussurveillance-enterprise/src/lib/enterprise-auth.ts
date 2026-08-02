import { createHmac, timingSafeEqual } from "crypto";

export class AuthError extends Error {
  status: number;

  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

export type Scope =
  | "portfolio:read"
  | "sites:read"
  | "site:read"
  | "legacy:import"
  | "firestore:read"
  | "audit:read"
  | "tenant:read"
  | "tenant:write";

export interface SessionPayload {
  sub: string;
  email: string;
  tenant: string;
  role: "admin" | "analyst";
  scopes: string[];
  exp: number;
}

export interface AuthContext {
  actorId: string;
  actorEmail?: string;
  tenant: string;
  authMethod: "session" | "api_key";
  scopes: string[];
  role?: string;
}

interface ApiKeyRecord {
  key: string;
  tenant: string;
  scopes: string[];
  actorId: string;
}

export const SESSION_COOKIE_NAME = "aus_intel_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;
const DEFAULT_ADMIN_EMAIL = "admin@aussurveillance.local";
const DEFAULT_ADMIN_PASSWORD = "changeme-admin";
const DEFAULT_SESSION_SCOPES: Scope[] = [
  "portfolio:read",
  "sites:read",
  "site:read",
  "legacy:import",
  "firestore:read",
  "audit:read",
  "tenant:read",
  "tenant:write",
];

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function getSessionSecret(): string {
  const configured = process.env.ENTERPRISE_SESSION_SECRET;
  if (configured && configured.length > 0) {
    return configured;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "ENTERPRISE_SESSION_SECRET must be configured in production.",
    );
  }
  return "dev-session-secret-change-me";
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(value: string): string {
  return createHmac("sha256", getSessionSecret()).update(value).digest("base64url");
}

function parseCookieHeader(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) {
    return {};
  }

  const cookies: Record<string, string> = {};
  const entries = cookieHeader.split(";");
  for (const entry of entries) {
    const [rawKey, ...rawValue] = entry.trim().split("=");
    if (!rawKey || rawValue.length === 0) {
      continue;
    }
    cookies[rawKey] = rawValue.join("=");
  }
  return cookies;
}

function hasScopes(scopes: string[], requiredScopes: Scope[]): boolean {
  if (scopes.includes("*")) {
    return true;
  }
  return requiredScopes.every((scope) => scopes.includes(scope));
}

function parseApiKeyRecords(): ApiKeyRecord[] {
  const json = process.env.ENTERPRISE_API_KEYS_JSON;
  if (!json) {
    const fallback = process.env.ENTERPRISE_DEFAULT_API_KEY;
    if (!fallback) {
      return [];
    }
    return [
      {
        key: fallback,
        tenant: process.env.ENTERPRISE_DEFAULT_API_TENANT ?? "internal",
        actorId: "default-api-key",
        scopes: [...DEFAULT_SESSION_SCOPES],
      },
    ];
  }

  try {
    const records = JSON.parse(json) as unknown[];
    if (!Array.isArray(records)) {
      return [];
    }
    return records
      .filter((item): item is Record<string, unknown> => {
        return Boolean(item && typeof item === "object");
      })
      .map((item) => ({
        key: String(item.key ?? ""),
        tenant: String(item.tenant ?? "internal"),
        actorId: String(item.actorId ?? "api-client"),
        scopes: Array.isArray(item.scopes)
          ? item.scopes.map((scope) => String(scope))
          : [],
      }))
      .filter((item) => item.key.length > 0);
  } catch {
    return [];
  }
}

function getApiKeyFromRequest(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length).trim();
  }
  const explicit = request.headers.get("x-api-key");
  if (explicit) {
    return explicit.trim();
  }
  return null;
}

function getSessionTokenFromRequest(request: Request): string | null {
  const cookies = parseCookieHeader(request.headers.get("cookie"));
  return cookies[SESSION_COOKIE_NAME] ?? null;
}

function verifyToken(token: string): SessionPayload | null {
  const [encodedPayload, providedSignature] = token.split(".");
  if (!encodedPayload || !providedSignature) {
    return null;
  }

  const expectedSignature = sign(encodedPayload);
  const providedBuffer = Buffer.from(providedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as SessionPayload;
    if (payload.exp <= nowSeconds()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function issueToken(payload: SessionPayload): string {
  const encoded = base64UrlEncode(JSON.stringify(payload));
  return `${encoded}.${sign(encoded)}`;
}

export function createSessionPayload(email: string): SessionPayload {
  return {
    sub: `operator:${email.toLowerCase()}`,
    email: email.toLowerCase(),
    tenant: "internal",
    role: "admin",
    scopes: [...DEFAULT_SESSION_SCOPES],
    exp: nowSeconds() + SESSION_TTL_SECONDS,
  };
}

export function validateOperatorCredentials(
  email: string,
  password: string,
): boolean {
  const configuredEmail = process.env.ENTERPRISE_ADMIN_EMAIL;
  const configuredPassword = process.env.ENTERPRISE_ADMIN_PASSWORD;
  const expectedEmail =
    configuredEmail?.toLowerCase() ??
    (process.env.NODE_ENV === "production" ? "" : DEFAULT_ADMIN_EMAIL);
  const expectedPassword =
    configuredPassword ??
    (process.env.NODE_ENV === "production" ? "" : DEFAULT_ADMIN_PASSWORD);

  return email.trim().toLowerCase() === expectedEmail && password === expectedPassword;
}

export function createSessionToken(payload: SessionPayload): string {
  return issueToken(payload);
}

export function getSessionFromRequest(request: Request): SessionPayload | null {
  const token = getSessionTokenFromRequest(request);
  if (!token) {
    return null;
  }
  return verifyToken(token);
}

export function authorizeRequest(
  request: Request,
  requiredScopes: Scope[],
): AuthContext {
  const session = getSessionFromRequest(request);
  if (session) {
    if (!hasScopes(session.scopes, requiredScopes)) {
      throw new AuthError("Session does not include required scopes.", 403);
    }
    return {
      actorId: session.sub,
      actorEmail: session.email,
      tenant: session.tenant,
      authMethod: "session",
      scopes: session.scopes,
      role: session.role,
    };
  }

  const apiKey = getApiKeyFromRequest(request);
  if (apiKey) {
    const keyRecord = parseApiKeyRecords().find((item) => item.key === apiKey);
    if (!keyRecord) {
      throw new AuthError("Invalid API key.", 401);
    }
    if (!hasScopes(keyRecord.scopes, requiredScopes)) {
      throw new AuthError("API key missing required scopes.", 403);
    }
    return {
      actorId: keyRecord.actorId,
      tenant: keyRecord.tenant,
      authMethod: "api_key",
      scopes: keyRecord.scopes,
      role: "api-client",
    };
  }

  throw new AuthError(
    "Unauthorized. Provide an operator session or API key.",
    401,
  );
}

