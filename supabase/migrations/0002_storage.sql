-- 附件的 Storage bucket。
--
-- 這個 bucket 是「公開讀取」的：檔名用隨機 UUID，網址猜不到，但拿到網址的人就看得到。
-- 換來的是預覽區可以直接引用、CDN 快取有效，而且匯出的 .md 檔在別的編輯器裡打開
-- 圖片照樣顯示（簽名網址會過期，匯出檔就廢了）。
-- 真正敏感的東西不要用附件功能。

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'attachments',
  'attachments',
  true,
  10485760, -- 10 MB。圖片會在瀏覽器端壓成 WebP，正常不會接近這個上限。
  null      -- 不限制型別，筆記本來就可能要放各種檔案
)
on conflict (id) do nothing;

-- 寫入權限限本人。路徑約定為 {user_id}/{uuid}.{ext}，
-- 用第一層資料夾名對上 auth.uid() 來判斷擁有者。
drop policy if exists attachments_insert_own on storage.objects;
create policy attachments_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists attachments_update_own on storage.objects;
create policy attachments_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists attachments_delete_own on storage.objects;
create policy attachments_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- 讀取不設 policy：bucket 的 public 旗標已經開放匿名讀取。
