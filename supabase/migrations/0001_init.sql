-- 筆記工具的初始 schema。
-- 在 Supabase Dashboard 的 SQL Editor 貼上執行，或用 supabase CLI 套用。

-- trigram 索引用，中文搜尋靠這個而不是 tsvector（預設斷詞器不處理中文）
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------- notes

create table if not exists public.notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  content     text not null default '',
  -- 標題直接從內文第一行推導，不另外存一個會不同步的欄位。
  -- 去掉開頭的 # 之後如果是空的就是 null，由前端改用內文摘要顯示。
  title       text generated always as (
                nullif(
                  btrim(regexp_replace(split_part(content, E'\n', 1), '^#{1,6}[ \t]*', '')),
                  ''
                )
              ) stored,
  pinned      boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

-- 列表查詢：未刪除的、釘選優先、依更新時間排
create index if not exists notes_user_updated_idx
  on public.notes (user_id, pinned desc, updated_at desc)
  where deleted_at is null;

-- 垃圾桶
create index if not exists notes_deleted_idx
  on public.notes (user_id, deleted_at)
  where deleted_at is not null;

-- 全文搜尋（trigram，對中文行為正確）
create index if not exists notes_content_trgm_idx
  on public.notes using gin (content gin_trgm_ops);

create index if not exists notes_title_trgm_idx
  on public.notes using gin (title gin_trgm_ops);

-- updated_at 由資料庫維護，前端傳什麼都會被蓋掉。
-- 樂觀鎖靠 `update ... where id = $1 and updated_at = $2`，影響列數為 0 就是有衝突。
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists notes_touch_updated_at on public.notes;
create trigger notes_touch_updated_at
  before update on public.notes
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- tags

create table if not exists public.tags (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null check (btrim(name) <> '' and length(name) <= 50),
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create index if not exists tags_user_name_trgm_idx
  on public.tags using gin (name gin_trgm_ops);

create table if not exists public.note_tags (
  note_id uuid not null references public.notes (id) on delete cascade,
  tag_id  uuid not null references public.tags (id) on delete cascade,
  primary key (note_id, tag_id)
);

create index if not exists note_tags_tag_idx on public.note_tags (tag_id);

-- ---------------------------------------------------------------- versions

create table if not exists public.versions (
  id         uuid primary key default gen_random_uuid(),
  note_id    uuid not null references public.notes (id) on delete cascade,
  content    text not null,
  created_at timestamptz not null default now()
);

create index if not exists versions_note_created_idx
  on public.versions (note_id, created_at desc);

-- ---------------------------------------------------------------- attachments

create table if not exists public.attachments (
  id           uuid primary key default gen_random_uuid(),
  note_id      uuid not null references public.notes (id) on delete cascade,
  storage_path text not null unique,
  filename     text not null,
  size         bigint not null,
  mime_type    text,
  created_at   timestamptz not null default now()
);

create index if not exists attachments_note_idx on public.attachments (note_id);

-- ---------------------------------------------------------------- RLS
-- 目前只有一個帳號，但照樣按多使用者設定，之後要開放他人使用不必改架構。

alter table public.notes       enable row level security;
alter table public.tags        enable row level security;
alter table public.note_tags   enable row level security;
alter table public.versions    enable row level security;
alter table public.attachments enable row level security;

drop policy if exists notes_owner on public.notes;
create policy notes_owner on public.notes
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists tags_owner on public.tags;
create policy tags_owner on public.tags
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 子資料表沒有 user_id，權限一律推導自所屬的筆記，避免兩邊不一致。
drop policy if exists note_tags_owner on public.note_tags;
create policy note_tags_owner on public.note_tags
  for all
  using (
    exists (select 1 from public.notes n where n.id = note_id and n.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.notes n where n.id = note_id and n.user_id = auth.uid())
  );

drop policy if exists versions_owner on public.versions;
create policy versions_owner on public.versions
  for all
  using (
    exists (select 1 from public.notes n where n.id = note_id and n.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.notes n where n.id = note_id and n.user_id = auth.uid())
  );

drop policy if exists attachments_owner on public.attachments;
create policy attachments_owner on public.attachments
  for all
  using (
    exists (select 1 from public.notes n where n.id = note_id and n.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.notes n where n.id = note_id and n.user_id = auth.uid())
  );

-- ---------------------------------------------------------------- 垃圾桶清理

-- 清掉丟進垃圾桶超過 30 天的筆記。附件的 Storage 檔案不會被這個函式刪掉 —
-- 資料列會因為 on delete cascade 消失，實體檔案要由應用層（或排程 Job）另外清。
create or replace function public.purge_deleted_notes()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  purged integer;
begin
  delete from public.notes
    where deleted_at is not null
      and deleted_at < now() - interval '30 days';
  get diagnostics purged = row_count;
  return purged;
end;
$$;

-- 排程執行（需要在 Dashboard 啟用 pg_cron 擴充後再跑這段）：
--   select cron.schedule('purge-deleted-notes', '0 4 * * *', $$select public.purge_deleted_notes()$$);
