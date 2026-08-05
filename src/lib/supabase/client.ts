import { createBrowserClient } from "@supabase/ssr";

import { supabasePublishableKey, supabaseUrl } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";

/** 瀏覽器端的 Supabase client，用於 Client Component。 */
export function createClient() {
  return createBrowserClient<Database>(supabaseUrl(), supabasePublishableKey());
}
