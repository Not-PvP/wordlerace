import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only client, used exclusively inside API routes. Uses the service
 * role key, which bypasses RLS — this is what makes the server authoritative
 * for room/player state. Never import this file from client components.
 *
 * Cached at module scope: a warm serverless instance reuses the same Node
 * process across requests, so this avoids rebuilding the client (and its
 * underlying HTTP agent) on every single API call.
 */
let cached: SupabaseClient | null = null;

export function createServiceClient(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!url || !serviceKey) {
    throw new Error("Missing Supabase server environment variables");
  }

  cached = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
  return cached;
}
