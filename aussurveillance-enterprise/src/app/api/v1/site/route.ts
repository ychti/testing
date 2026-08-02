import { NextResponse } from "next/server";
import { getScoredSites } from "@/lib/security-intelligence";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const siteId = url.searchParams.get("siteId");
  if (!siteId) {
    return NextResponse.json(
      {
        error: "siteId query parameter is required.",
      },
      { status: 400 },
    );
  }

  const site = getScoredSites().find((item) => item.site.id === siteId);
  if (!site) {
    return NextResponse.json(
      {
        error: `No site found for siteId ${siteId}.`,
      },
      { status: 404 },
    );
  }

  return NextResponse.json(site);
}
