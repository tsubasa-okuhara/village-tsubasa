"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SUPABASE_SUB2_SERVICE_ROLE_KEY = exports.SUPABASE_SERVICE_ROLE_KEY = void 0;
exports.getSupabaseClient = getSupabaseClient;
exports.getSupabaseSub2Client = getSupabaseSub2Client;
const supabase_js_1 = require("@supabase/supabase-js");
const params_1 = require("firebase-functions/params");
exports.SUPABASE_SERVICE_ROLE_KEY = (0, params_1.defineSecret)("SUPABASE_SERVICE_ROLE_KEY");
exports.SUPABASE_SUB2_SERVICE_ROLE_KEY = (0, params_1.defineSecret)("SUPABASE_SUB2_SERVICE_ROLE_KEY");
const SUPABASE_URL = "https://pbqqqwwgswniuomjlhsh.supabase.co";
const SUPABASE_SUB2_URL = "https://gmellfgcyypfrtjxblla.supabase.co";
let supabaseClient = null;
let supabaseSub2Client = null;
function getSupabaseClient() {
    if (supabaseClient) {
        return supabaseClient;
    }
    const serviceRoleKey = exports.SUPABASE_SERVICE_ROLE_KEY.value();
    supabaseClient = (0, supabase_js_1.createClient)(SUPABASE_URL, serviceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });
    return supabaseClient;
}
function getSupabaseSub2Client() {
    if (supabaseSub2Client) {
        return supabaseSub2Client;
    }
    const serviceRoleKey = exports.SUPABASE_SUB2_SERVICE_ROLE_KEY.value();
    supabaseSub2Client = (0, supabase_js_1.createClient)(SUPABASE_SUB2_URL, serviceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });
    return supabaseSub2Client;
}
