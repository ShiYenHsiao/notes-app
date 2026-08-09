-- Knowledge Layer v1：Markdown 仍是唯一權威來源，這張表只是可重建的查詢索引。

create or replace function public.normalize_note_title(p_input text)
returns text
language sql
immutable
strict
set search_path = public, pg_temp
as $$
  select btrim(normalize(p_input, NFC), E' \t\n\r\f\v　')
$$;

create index if not exists notes_normalized_title_idx
  on public.notes (user_id, public.normalize_note_title(title))
  where deleted_at is null and title is not null;

create table if not exists public.note_links (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  source_note_id     uuid not null references public.notes (id) on delete cascade,
  target_note_id     uuid references public.notes (id) on delete set null,
  target_title       text not null check (btrim(target_title) <> ''),
  occurrence_index   integer not null check (occurrence_index >= 0),
  source_from        integer not null check (source_from >= 0),
  source_to          integer not null check (source_to > source_from),
  source_updated_at  timestamptz not null,
  content_hash       text not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (source_note_id, occurrence_index)
);

create index if not exists note_links_user_source_idx
  on public.note_links (user_id, source_note_id);

create index if not exists note_links_user_target_idx
  on public.note_links (user_id, target_note_id, source_note_id)
  where target_note_id is not null;

create index if not exists note_links_user_unresolved_idx
  on public.note_links (user_id, target_title, source_note_id)
  where target_note_id is null;

create index if not exists note_links_source_revision_idx
  on public.note_links (source_note_id, source_updated_at, content_hash);

alter table public.note_links enable row level security;

revoke all on table public.note_links from anon;
grant select, insert, update, delete on table public.note_links to authenticated;

drop policy if exists note_links_owner_select on public.note_links;
create policy note_links_owner_select on public.note_links
  for select
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.notes source
      where source.id = source_note_id and source.user_id = auth.uid()
    )
    and (
      target_note_id is null
      or exists (
        select 1 from public.notes target
        where target.id = target_note_id and target.user_id = auth.uid()
      )
    )
  );

drop policy if exists note_links_owner_insert on public.note_links;
create policy note_links_owner_insert on public.note_links
  for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.notes source
      where source.id = source_note_id and source.user_id = auth.uid()
    )
    and (
      target_note_id is null
      or exists (
        select 1 from public.notes target
        where target.id = target_note_id and target.user_id = auth.uid()
      )
    )
  );

drop policy if exists note_links_owner_update on public.note_links;
create policy note_links_owner_update on public.note_links
  for update
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.notes source
      where source.id = source_note_id and source.user_id = auth.uid()
    )
    and (
      target_note_id is null
      or exists (
        select 1 from public.notes target
        where target.id = target_note_id and target.user_id = auth.uid()
      )
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.notes source
      where source.id = source_note_id and source.user_id = auth.uid()
    )
    and (
      target_note_id is null
      or exists (
        select 1 from public.notes target
        where target.id = target_note_id and target.user_id = auth.uid()
      )
    )
  );

drop policy if exists note_links_owner_delete on public.note_links;
create policy note_links_owner_delete on public.note_links
  for delete
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.notes source
      where source.id = source_note_id and source.user_id = auth.uid()
    )
    and (
      target_note_id is null
      or exists (
        select 1 from public.notes target
        where target.id = target_note_id and target.user_id = auth.uid()
      )
    )
  );

-- 單篇索引以一個 transaction 全換掉。expected updated_at 讓舊存檔請求不能覆蓋新索引。
create or replace function public.replace_note_links(
  p_source_note_id uuid,
  p_expected_updated_at timestamptz,
  p_content_hash text,
  p_links jsonb
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  owner_id uuid;
begin
  select n.user_id into owner_id
  from public.notes n
  where n.id = p_source_note_id
    and n.updated_at = p_expected_updated_at
    and n.deleted_at is null;

  if owner_id is null or owner_id <> auth.uid() then
    return false;
  end if;

  delete from public.note_links where source_note_id = p_source_note_id;

  insert into public.note_links (
    user_id,
    source_note_id,
    target_note_id,
    target_title,
    occurrence_index,
    source_from,
    source_to,
    source_updated_at,
    content_hash
  )
  select
    owner_id,
    p_source_note_id,
    case
      when item.target_note_id is not null and exists (
        select 1 from public.notes target
        where target.id = item.target_note_id
          and target.user_id = owner_id
          and target.deleted_at is null
          and public.normalize_note_title(target.title) = public.normalize_note_title(item.target_title)
          and not exists (
            select 1 from public.notes duplicate
            where duplicate.user_id = owner_id
              and duplicate.id <> target.id
              and duplicate.deleted_at is null
              and public.normalize_note_title(duplicate.title) =
                public.normalize_note_title(item.target_title)
          )
      ) then item.target_note_id
      else null
    end,
    public.normalize_note_title(item.target_title),
    item.occurrence_index,
    item.source_from,
    item.source_to,
    p_expected_updated_at,
    p_content_hash
  from jsonb_to_recordset(coalesce(p_links, '[]'::jsonb)) as item(
    target_note_id uuid,
    target_title text,
    occurrence_index integer,
    source_from integer,
    source_to integer
  );

  return true;
end;
$$;

-- title resolution 走同一個 NFC＋trim 規則，RLS 仍由 invoker 身分套用。
create or replace function public.resolve_note_titles(p_titles jsonb)
returns table(id uuid, title text, updated_at timestamptz)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select n.id, public.normalize_note_title(n.title), n.updated_at
  from public.notes n
  where n.deleted_at is null
    and n.title is not null
    and public.normalize_note_title(n.title) in (
      select value from jsonb_array_elements_text(coalesce(p_titles, '[]'::jsonb))
    )
$$;

-- Quick Create 用 advisory lock 把同一使用者／同一 title 的競態收進一個 transaction。
create or replace function public.create_linked_note(p_title text)
returns table(status text, note_id uuid)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  owner_id uuid := auth.uid();
  requested_title text := public.normalize_note_title(p_title);
  matching_ids uuid[];
  created_id uuid;
begin
  if owner_id is null or requested_title is null or requested_title = '' then
    raise exception 'invalid wiki link title';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(owner_id::text || E'\n' || requested_title, 0));

  select array_agg(n.id order by n.updated_at desc, n.id)
  into matching_ids
  from public.notes n
  where n.user_id = owner_id
    and n.deleted_at is null
    and public.normalize_note_title(n.title) = requested_title;

  if coalesce(array_length(matching_ids, 1), 0) > 1 then
    return query select 'ambiguous'::text, null::uuid;
    return;
  end if;

  if coalesce(array_length(matching_ids, 1), 0) = 1 then
    return query select 'existing'::text, matching_ids[1];
    return;
  end if;

  insert into public.notes (user_id, content)
  values (owner_id, '# ' || requested_title || E'\n')
  returning id into created_id;

  return query select 'created'::text, created_id;
end;
$$;

-- 改名涉及多篇 Markdown：先鎖定並驗證全部 optimistic-lock token，任一衝突就整筆回滾。
create or replace function public.rename_note_with_links(
  p_note_id uuid,
  p_expected_updated_at timestamptz,
  p_content text,
  p_source_updates jsonb
)
returns timestamptz
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  owner_id uuid := auth.uid();
  current_content text;
  current_updated_at timestamptz;
  source_item record;
  source_content text;
  source_updated_at timestamptz;
  saved_updated_at timestamptz;
  new_title text := public.normalize_note_title(
    nullif(
      btrim(regexp_replace(split_part(p_content, E'\n', 1), '^#{1,6}[ \t]*', '')),
      ''
    )
  );
begin
  if owner_id is null then
    raise exception 'unauthorized';
  end if;

  if new_title is not null and jsonb_array_length(coalesce(p_source_updates, '[]'::jsonb)) > 0 then
    perform pg_advisory_xact_lock(hashtextextended(owner_id::text || E'\n' || new_title, 0));
    if exists (
      select 1 from public.notes duplicate
      where duplicate.user_id = owner_id
        and duplicate.id <> p_note_id
        and duplicate.deleted_at is null
        and public.normalize_note_title(duplicate.title) = new_title
    ) then
      raise exception using errcode = '23505', message = 'rename title is ambiguous';
    end if;
  end if;

  select n.content, n.updated_at
  into current_content, current_updated_at
  from public.notes n
  where n.id = p_note_id
    and n.user_id = owner_id
    and n.deleted_at is null
  for update;

  if current_updated_at is null or current_updated_at <> p_expected_updated_at then
    raise exception using errcode = '40001', message = 'rename target changed';
  end if;

  -- 先把所有來源鎖好並驗證；此時還沒有任何正文被改寫。
  for source_item in
    select * from jsonb_to_recordset(coalesce(p_source_updates, '[]'::jsonb)) as item(
      note_id uuid,
      expected_updated_at timestamptz,
      content text
    )
    order by note_id
  loop
    if source_item.note_id = p_note_id then
      raise exception 'target must not be repeated in source updates';
    end if;

    select n.content, n.updated_at
    into source_content, source_updated_at
    from public.notes n
    where n.id = source_item.note_id
      and n.user_id = owner_id
      and n.deleted_at is null
    for update;

    if source_updated_at is null or source_updated_at <> source_item.expected_updated_at then
      raise exception using errcode = '40001', message = 'rename source changed';
    end if;
  end loop;

  if not exists (
    select 1 from public.versions v
    where v.note_id = p_note_id and v.created_at > now() - interval '10 minutes'
  ) then
    insert into public.versions (note_id, content) values (p_note_id, current_content);
  end if;

  update public.notes
  set content = p_content
  where id = p_note_id
  returning updated_at into saved_updated_at;

  for source_item in
    select * from jsonb_to_recordset(coalesce(p_source_updates, '[]'::jsonb)) as item(
      note_id uuid,
      expected_updated_at timestamptz,
      content text
    )
    order by note_id
  loop
    select n.content into source_content from public.notes n where n.id = source_item.note_id;

    if not exists (
      select 1 from public.versions v
      where v.note_id = source_item.note_id and v.created_at > now() - interval '10 minutes'
    ) then
      insert into public.versions (note_id, content) values (source_item.note_id, source_content);
    end if;

    update public.notes set content = source_item.content where id = source_item.note_id;
  end loop;

  -- 跟應用層相同，每篇只留最新 30 份。window query 限在本次受影響的筆記。
  delete from public.versions v
  using (
    select ranked.id
    from (
      select
        version.id,
        row_number() over (partition by version.note_id order by version.created_at desc) as rank
      from public.versions version
      where version.note_id = p_note_id
         or version.note_id in (
           select item.note_id
           from jsonb_to_recordset(coalesce(p_source_updates, '[]'::jsonb)) as item(note_id uuid)
         )
    ) ranked
    where ranked.rank > 30
  ) stale
  where v.id = stale.id;

  return saved_updated_at;
end;
$$;

revoke all on function public.replace_note_links(uuid, timestamptz, text, jsonb) from public;
revoke all on function public.resolve_note_titles(jsonb) from public;
revoke all on function public.create_linked_note(text) from public;
revoke all on function public.rename_note_with_links(uuid, timestamptz, text, jsonb) from public;

grant execute on function public.replace_note_links(uuid, timestamptz, text, jsonb) to authenticated;
grant execute on function public.resolve_note_titles(jsonb) to authenticated;
grant execute on function public.create_linked_note(text) to authenticated;
grant execute on function public.rename_note_with_links(uuid, timestamptz, text, jsonb) to authenticated;
