import { NextResponse } from "next/server";
import { getScoredSites } from "@/lib/security-intelligence";

export async function GET() {
  return NextResponse.json({
    count: getScoredSites().length,
    sites: getScoredSites(),
  });
}
