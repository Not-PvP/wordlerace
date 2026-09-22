import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Browser client. Uses the anon key, which (per our RLS policies) can only
 * read public room/player rows and subscribe to realtime changes — it can
 * never write. All writes go through server API routes.
 */
export const supabase = createClient(url, anonKey, {
  auth: { persistSession: false },
});
