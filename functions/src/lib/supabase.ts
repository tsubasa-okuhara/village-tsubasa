import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { defineSecret } from "firebase-functions/params";

export const SUPABASE_SERVICE_ROLE_KEY = defineSecret("SUPABASE_SERVICE_ROLE_KEY");
export const SUPABASE_SUB2_SERVICE_ROLE_KEY = defineSecret("SUPABASE_SUB2_SERVICE_ROLE_KEY");

const SUPABASE_URL = "https://pbqqqwwgswniuomjlhsh.supabase.co";
const SUPABASE_SUB2_URL = "https://gmellfgcyypfrtjxblla.supabase.co";

let supabaseClient: SupabaseClient | null = null;
let supabaseSub2Client: SupabaseClient | null = null;

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

export function getSupabaseSub2Client(): SupabaseClient {
  if (supabaseSub2Client) {
    return supabaseSub2Client;
  }

  const serviceRoleKey = SUPABASE_SUB2_SERVICE_ROLE_KEY.value();

  supabaseSub2Client = createClient(SUPABASE_SUB2_URL, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return supabaseSub2Client;
}
