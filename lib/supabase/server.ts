import { createClient } from "@supabase/supabase-js";

/**
 * Server-only client, used exclusively inside API routes. Uses the service
 * role key, which bypasses RLS — this is what makes the server authoritative
 * for room/player state. Never import this file from client components.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!url || !serviceKey) {
    throw new Error("Missing Supabase server environment variables");
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}
