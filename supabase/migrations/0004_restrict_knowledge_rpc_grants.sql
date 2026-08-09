-- Supabase 舊專案的 default privileges 會直接授權 anon；只撤銷 PUBLIC 不會移除該 ACL。

revoke execute on function public.replace_note_links(uuid, timestamptz, text, jsonb) from anon;
revoke execute on function public.replace_note_links(uuid, timestamptz, text, jsonb) from public;
grant execute on function public.replace_note_links(uuid, timestamptz, text, jsonb) to authenticated;

revoke execute on function public.resolve_note_titles(jsonb) from anon;
revoke execute on function public.resolve_note_titles(jsonb) from public;
grant execute on function public.resolve_note_titles(jsonb) to authenticated;

revoke execute on function public.create_linked_note(text) from anon;
revoke execute on function public.create_linked_note(text) from public;
grant execute on function public.create_linked_note(text) to authenticated;

revoke execute on function public.rename_note_with_links(uuid, timestamptz, text, jsonb) from anon;
revoke execute on function public.rename_note_with_links(uuid, timestamptz, text, jsonb) from public;
grant execute on function public.rename_note_with_links(uuid, timestamptz, text, jsonb) to authenticated;
