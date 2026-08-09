import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const migration = await readFile(
  new URL("../supabase/migrations/0003_knowledge_links.sql", import.meta.url),
  "utf8",
);
const rpcGrantsMigration = await readFile(
  new URL("../supabase/migrations/0004_restrict_knowledge_rpc_grants.sql", import.meta.url),
  "utf8",
);

test("note_links 保存可重建 occurrence、title、immutable id 與來源版本", () => {
  for (const column of [
    "source_note_id",
    "target_note_id",
    "target_title",
    "occurrence_index",
    "source_updated_at",
    "content_hash",
  ]) {
    assert.match(migration, new RegExp(`\\b${column}\\b`));
  }
  assert.match(migration, /target_note_id\s+uuid references public\.notes \(id\) on delete set null/i);
  assert.match(migration, /unique \(source_note_id, occurrence_index\)/i);
});

test("backlinks、unresolved 與 stale repair 查詢都有索引", () => {
  assert.match(migration, /note_links_user_target_idx/);
  assert.match(migration, /note_links_user_unresolved_idx/);
  assert.match(migration, /note_links_source_revision_idx/);
  assert.match(migration, /notes_normalized_title_idx/);
});

test("RLS 四種操作都驗證 auth scope，resolved target 也需同 owner", () => {
  assert.match(migration, /alter table public\.note_links enable row level security/i);
  for (const operation of ["select", "insert", "update", "delete"]) {
    assert.match(migration, new RegExp(`note_links_owner_${operation}`));
  }
  assert.match(migration, /source\.user_id = auth\.uid\(\)/);
  assert.match(migration, /target\.user_id = auth\.uid\(\)/);
});

test("索引替換比對成功保存版本，舊請求不能覆蓋新 index", () => {
  assert.match(migration, /n\.updated_at = p_expected_updated_at/);
  assert.match(migration, /delete from public\.note_links where source_note_id = p_source_note_id/);
  assert.match(migration, /create or replace function public\.replace_note_links/);
});

test("Quick Create 與 rename DB function 固定 search_path 且不使用 security definer", () => {
  for (const name of ["create_linked_note", "rename_note_with_links", "replace_note_links"]) {
    const start = migration.indexOf(`function public.${name}`);
    assert.notEqual(start, -1);
    const body = migration.slice(start, migration.indexOf("$$;", start));
    assert.match(body, /security invoker/);
    assert.match(body, /set search_path = public, pg_temp/);
    assert.doesNotMatch(body, /security definer/);
  }
});

test("rename 先鎖定全部來源、驗證 token，再更新正文並留下 snapshots", () => {
  const start = migration.indexOf("function public.rename_note_with_links");
  const body = migration.slice(start, migration.indexOf("$$;", start));
  const firstUpdate = body.indexOf("update public.notes");
  assert.ok(body.indexOf("for update") < firstUpdate);
  assert.ok(body.indexOf("source_item.expected_updated_at") < firstUpdate);
  assert.match(body, /insert into public\.versions/);
  assert.match(body, /row_number\(\) over \(partition by version\.note_id/);
});

test("rename 與 Quick Create 共用正規化 title advisory lock，競態不會產生半完成連結", () => {
  const lock = /pg_advisory_xact_lock\(hashtextextended\(owner_id::text \|\| E'\\n' \|\| (?:requested_title|new_title), 0\)\)/g;
  assert.equal([...migration.matchAll(lock)].length, 2);
  assert.match(migration, /requested_title text := public\.normalize_note_title\(p_title\)/);
  assert.match(migration, /errcode = '23505', message = 'rename title is ambiguous'/);
});

const knowledgeRpcSignatures = [
  "replace_note_links(uuid, timestamptz, text, jsonb)",
  "resolve_note_titles(jsonb)",
  "create_linked_note(text)",
  "rename_note_with_links(uuid, timestamptz, text, jsonb)",
];

test("Knowledge RPC 最終撤銷 anon 與 PUBLIC，只明確授予 authenticated", () => {
  for (const signature of knowledgeRpcSignatures) {
    const revokeAnon = `revoke execute on function public.${signature} from anon;`;
    const revokePublic = `revoke execute on function public.${signature} from public;`;
    const grantAuthenticated = `grant execute on function public.${signature} to authenticated;`;

    assert.ok(rpcGrantsMigration.includes(revokeAnon), `${signature} 必須撤銷 anon EXECUTE`);
    assert.ok(rpcGrantsMigration.includes(revokePublic), `${signature} 必須撤銷 PUBLIC EXECUTE`);
    assert.ok(
      rpcGrantsMigration.includes(grantAuthenticated),
      `${signature} 必須授予 authenticated EXECUTE`,
    );
  }
});

test("Knowledge RPC 權限 migration 不會在 revoke 後重新開放 anon 或 PUBLIC", () => {
  for (const signature of knowledgeRpcSignatures) {
    const revokeAnon = `revoke execute on function public.${signature} from anon;`;
    const revokePublic = `revoke execute on function public.${signature} from public;`;
    const grantAuthenticated = `grant execute on function public.${signature} to authenticated;`;

    assert.ok(
      rpcGrantsMigration.indexOf(revokeAnon) < rpcGrantsMigration.indexOf(grantAuthenticated),
      `${signature} 的 authenticated grant 必須在 anon revoke 之後`,
    );
    assert.ok(
      rpcGrantsMigration.indexOf(revokePublic) < rpcGrantsMigration.indexOf(grantAuthenticated),
      `${signature} 的 authenticated grant 必須在 PUBLIC revoke 之後`,
    );
  }

  assert.doesNotMatch(
    rpcGrantsMigration,
    /grant execute on function public\.[^(]+\([^;]+\) to (?:anon|public);/i,
  );
});
