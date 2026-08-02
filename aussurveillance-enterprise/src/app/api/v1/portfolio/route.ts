import { NextResponse } from "next/server";
import { getPortfolioSummary } from "@/lib/security-intelligence";

export async function GET() {
  return NextResponse.json(getPortfolioSummary());
}
