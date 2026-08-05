import { AppShell } from "@/components/app-shell";
import { SetupNotice } from "@/components/setup-notice";
import { isSupabaseConfigured } from "@/lib/env";

export default function Home() {
  if (!isSupabaseConfigured()) {
    return <SetupNotice />;
  }

  return <AppShell />;
}
