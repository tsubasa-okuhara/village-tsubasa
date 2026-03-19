import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { defineSecret } from "firebase-functions/params";

export const SUPABASE_SERVICE_ROLE_KEY = defineSecret("SUPABASE_SERVICE_ROLE_KEY");

const SUPABASE_URL = "https://pbqqqwwgswniuomjlhsh.supabase.co";

let supabaseClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (supabaseClient) {
    return supabaseClient;
  }

  const serviceRoleKey = SUPABASE_SERVICE_ROLE_KEY.value();

  supabaseClient = createClient(SUPABASE_URL, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return supabaseClient;
}
