import type { WikiLinkResolution, WikiNoteCandidate } from "@/lib/wiki-links";

async function responseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`Knowledge request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

/**
 * 自動完成與 Quick Open 是可取消的讀取，不走 Server Action 的逐次佇列，才不會排在
 * autosave 前面。驗證與 RLS 仍由 Route Handler／Supabase 執行。
 */
export async function searchKnowledgeNotes(
  query: string,
  limit = 20,
  signal?: AbortSignal,
): Promise<WikiNoteCandidate[]> {
  const params = new URLSearchParams({ query, limit: String(limit) });
  const response = await fetch(`/api/knowledge/search?${params}`, {
    method: "GET",
    signal,
  });
  return responseJson<WikiNoteCandidate[]>(response);
}

export async function resolveKnowledgeLinks(
  titles: string[],
  signal?: AbortSignal,
): Promise<WikiLinkResolution[]> {
  const response = await fetch("/api/knowledge/resolve", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ titles }),
    signal,
  });
  return responseJson<WikiLinkResolution[]>(response);
}
