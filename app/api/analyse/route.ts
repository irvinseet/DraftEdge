import { NextRequest, NextResponse } from "next/server";
import { analyseTeam } from "@/lib/fpl/data";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const rawTeamId = request.nextUrl.searchParams.get("teamId") ?? "";
  if (!/^\d+$/.test(rawTeamId)) {
    return NextResponse.json({ error: "Enter a valid numeric FPL Draft team ID." }, { status: 400 });
  }

  try {
    const analysis = await analyseTeam(Number(rawTeamId));
    return NextResponse.json(analysis, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Analysis failed.";
    const status = message.includes("returned 404") ? 404 : 502;
    return NextResponse.json(
      { error: status === 404 ? "That FPL Draft team ID was not found." : message },
      { status },
    );
  }
}
