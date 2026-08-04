import { NextResponse } from "next/server";
import {
  type AuthContext,
  AuthError,
  authorizeRequest,
  type Scope,
} from "@/lib/enterprise-auth";
import { getLatestImportRun } from "@/lib/tenant-store";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { formatCurrencyAud } from "@/lib/format";

const REQUIRED_SCOPES: Scope[] = ["tenant:read", "portfolio:read"];

function allowPublicRead(): boolean {
  return (
    process.env.ALLOW_PUBLIC_TENANT_READ === "true" ||
    process.env.NODE_ENV !== "production"
  );
}

function resolveAuth(request: Request): AuthContext {
  try {
    return authorizeRequest(request, REQUIRED_SCOPES);
  } catch (error) {
    if (error instanceof AuthError && allowPublicRead()) {
      return {
        actorId: "public-report-read",
        tenant: "public",
        authMethod: "api_key",
        scopes: REQUIRED_SCOPES,
        role: "public",
      };
    }
    throw error;
  }
}

function markdownReport(tenantId: string, latest: NonNullable<Awaited<ReturnType<typeof getLatestImportRun>>>) {
  const topSites = [...latest.summary.sites]
    .sort((a, b) => a.riskScore - b.riskScore)
    .slice(0, 10);
  const controls = new Set<string>();
  for (const site of topSites) {
    for (const control of site.underwriting?.requiredControls ?? []) {
      controls.add(control);
    }
  }
  const controlList = Array.from(controls).slice(0, 8);
  const underwriting = latest.summary.underwriting ?? {
    approve: 0,
    conditional: 0,
    refer: 0,
    decline: 0,
  };
  return `# Executive Security Risk Report

- Tenant: ${tenantId}
- Snapshot Run: ${latest.id}
- Imported: ${latest.createdAt}
- Source: ${latest.source}

## Portfolio Summary

- Portfolio risk score: ${latest.summary.portfolioRiskScore}/100
- Confidence score: ${latest.summary.portfolioConfidenceScore}/100
- Freshness score: ${latest.summary.portfolioFreshnessScore}/100
- At-risk sites: ${latest.summary.atRiskSites}/${latest.summary.totalSites}
- Estimated monthly exposure: ${formatCurrencyAud(latest.summary.estimatedMonthlyExposureAud)}

## Underwriting Decision Mix

- Approve: ${underwriting.approve}
- Conditional: ${underwriting.conditional}
- Refer: ${underwriting.refer}
- Decline: ${underwriting.decline}

## Highest Risk Sites

${topSites
  .map(
    (site, index) =>
      `${index + 1}. **${site.site.name}** (${site.site.region})  
   Risk ${site.riskScore}/100 · Confidence ${site.confidenceScore}/100 · Exposure ${formatCurrencyAud(site.estimatedMonthlyExposureAud)}  
   Underwriting: ${(site.underwriting?.decision ?? "refer").toUpperCase()} (${(site.underwriting?.premiumAdjustmentPct ?? 0) >= 0 ? "+" : ""}${site.underwriting?.premiumAdjustmentPct ?? 0}%)`,
  )
  .join("\n\n")}

## Priority Controls

${controlList.length > 0 ? controlList.map((control) => `- ${control}`).join("\n") : "- No immediate controls required."}
`;
}

export async function GET(request: Request) {
  try {
    const auth = resolveAuth(request);
    enforceRateLimit(
      request,
      {
        keyPrefix: "reports-executive-read",
        maxRequests: 30,
        windowMs: 60_000,
      },
      auth.actorId,
    );
    const url = new URL(request.url);
    const tenantId = url.searchParams.get("tenantId");
    const format = (url.searchParams.get("format") ?? "markdown").toLowerCase();
    if (!tenantId) {
      return NextResponse.json(
        { error: "tenantId query parameter is required." },
        { status: 400 },
      );
    }

    const latest = await getLatestImportRun(tenantId);
    if (!latest) {
      return NextResponse.json(
        { error: `No imported portfolio snapshot for tenant ${tenantId}.` },
        { status: 404 },
      );
    }

    if (format === "json") {
      return NextResponse.json({
        tenantId,
        runId: latest.id,
        importedAt: latest.createdAt,
        source: latest.source,
        summary: latest.summary,
        warnings: latest.warnings,
      });
    }

    const markdown = markdownReport(tenantId, latest);
    return new NextResponse(markdown, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${tenantId}-executive-report.md"`,
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
            : "Failed to generate executive report.",
      },
      { status: 500 },
    );
  }
}
