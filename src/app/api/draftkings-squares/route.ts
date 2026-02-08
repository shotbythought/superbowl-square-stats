import { NextResponse } from "next/server";
import { fetchDraftKingsSquaresOdds } from "@/lib/draftkings-squares";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const data = await fetchDraftKingsSquaresOdds();
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
