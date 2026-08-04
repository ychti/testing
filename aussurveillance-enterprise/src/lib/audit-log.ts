import { mkdir, appendFile, readFile } from "fs/promises";
import path from "path";

interface AuditEventInput {
  action: string;
  status: "success" | "denied" | "error";
  actorId: string;
  actorEmail?: string;
  tenant?: string;
  authMethod?: string;
  request: Request;
  details?: Record<string, unknown>;
}

interface AuditEventRecord {
  timestamp: string;
  action: string;
  status: "success" | "denied" | "error";
  actorId: string;
  actorEmail?: string;
  tenant?: string;
  authMethod?: string;
  method: string;
  path: string;
  ip: string;
  userAgent: string;
  details?: Record<string, unknown>;
}

function auditLogPath(): string {
  return (
    process.env.ENTERPRISE_AUDIT_LOG_PATH ??
    "/tmp/aussurveillance-enterprise-audit.log"
  );
}

function getRequestIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }
  return "unknown";
}

function toRecord(input: AuditEventInput): AuditEventRecord {
  const url = new URL(input.request.url);
  return {
    timestamp: new Date().toISOString(),
    action: input.action,
    status: input.status,
    actorId: input.actorId,
    actorEmail: input.actorEmail,
    tenant: input.tenant,
    authMethod: input.authMethod,
    method: input.request.method,
    path: url.pathname,
    ip: getRequestIp(input.request),
    userAgent: input.request.headers.get("user-agent") ?? "unknown",
    details: input.details,
  };
}

export async function logAuditEvent(input: AuditEventInput): Promise<void> {
  const record = toRecord(input);
  const logPath = auditLogPath();
  await mkdir(path.dirname(logPath), { recursive: true });
  await appendFile(logPath, `${JSON.stringify(record)}\n`, "utf8");
}

export async function readRecentAuditEvents(limit = 100): Promise<AuditEventRecord[]> {
  const logPath = auditLogPath();
  try {
    const content = await readFile(logPath, "utf8");
    const lines = content
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const recent = lines.slice(Math.max(0, lines.length - limit));
    return recent
      .map((line) => {
        try {
          return JSON.parse(line) as AuditEventRecord;
        } catch {
          return null;
        }
      })
      .filter((entry): entry is AuditEventRecord => Boolean(entry));
  } catch {
    return [];
  }
}

