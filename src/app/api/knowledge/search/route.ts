import { type NextRequest, NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { searchWikiNoteCandidates } from "@/lib/knowledge";

export async function GET(request: NextRequest) {
  await requireUser();
  const query = request.nextUrl.searchParams.get("query") ?? "";
  const requestedLimit = Number(request.nextUrl.searchParams.get("limit") ?? 20);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 30)
    : 20;

  return NextResponse.json(await searchWikiNoteCandidates(query, limit));
}
