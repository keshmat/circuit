import { createClient } from "@supabase/supabase-js";

if (!import.meta.env.PUBLIC_SUPABASE_URL) {
  throw new Error("Missing env.PUBLIC_SUPABASE_URL");
}

if (!import.meta.env.PUBLIC_SUPABASE_ANON_KEY) {
  throw new Error("Missing env.PUBLIC_SUPABASE_ANON_KEY");
}

export const supabase = createClient(
  import.meta.env.PUBLIC_SUPABASE_URL,
  import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }
);
