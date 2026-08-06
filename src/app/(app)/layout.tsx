import { AppShell } from "@/components/app-shell";
import { SetupNotice } from "@/components/setup-notice";
import { requireUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/env";
import { countNotes, listNotes } from "@/lib/notes";
import { listTags } from "@/lib/tags";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!isSupabaseConfigured()) {
    return <SetupNotice />;
  }

  // proxy.ts 已經擋過一次，這裡是真正把關的地方。
  await requireUser();

  const [notes, counts, tags] = await Promise.all([listNotes(), countNotes(), listTags()]);

  return (
    <AppShell notes={notes} counts={counts} tags={tags}>
      {children}
    </AppShell>
  );
}
