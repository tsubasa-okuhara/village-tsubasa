import fs from "node:fs";
import path from "node:path";

import dotenv from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let envLoaded = false;
let supabaseClient: SupabaseClient | null = null;

function loadEnvIfNeeded(): void {
  if (envLoaded) {
    return;
  }

  const candidatePaths = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "../.env"),
    path.resolve(__dirname, "../../../.env"),
  ];

  for (const candidatePath of candidatePaths) {
    if (!fs.existsSync(candidatePath)) {
      continue;
    }

    dotenv.config({ path: candidatePath });
    break;
  }

  envLoaded = true;
}

function getRequiredEnv(name: "SUPABASE_URL" | "SUPABASE_SERVICE_ROLE_KEY"): string {
  loadEnvIfNeeded();

  const value = process.env[name];

  if (!value) {
    throw new Error(`[schedule-sync] missing environment variable: ${name}`);
  }

  return value;
}

export function getSupabaseClient(): SupabaseClient {
  if (supabaseClient) {
    return supabaseClient;
  }

  const supabaseUrl = getRequiredEnv("SUPABASE_URL");
  const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");

  supabaseClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return supabaseClient;
}
