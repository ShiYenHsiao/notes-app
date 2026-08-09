import { NextRequest, NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { rebuildKnowledgeBatch } from "@/lib/knowledge";

/** Route Handler 不進 Server Action 的 client-side sequential queue，backfill 才不會擋 autosave。 */
export async function POST(request: NextRequest) {
  await requireUser();
  const body: unknown = await request.json().catch(() => ({}));
  const requested =
    body && typeof body === "object" && "cursor" in body
      ? (body as { cursor?: unknown }).cursor
      : undefined;
  const cursor =
    typeof requested === "string" && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(requested)
      ? requested
      : undefined;

  return NextResponse.json(await rebuildKnowledgeBatch(cursor));
}
