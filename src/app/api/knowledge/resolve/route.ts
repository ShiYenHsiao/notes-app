import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { resolveWikiTitles } from "@/lib/knowledge";

export async function POST(request: Request) {
  await requireUser();
  const body: unknown = await request.json().catch(() => ({}));
  const titles =
    body && typeof body === "object" && "titles" in body && Array.isArray(body.titles)
      ? body.titles.filter((title): title is string => typeof title === "string").slice(0, 100)
      : [];

  return NextResponse.json(await resolveWikiTitles(titles));
}
