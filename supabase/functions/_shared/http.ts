// HTTP helpers shared by every function.

import { createClient } from "npm:@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Service-role client: bypasses RLS, so every caller validates access itself. */
export function adminClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

/** Customer + card + business, everything a wallet pass needs. */
export async function loadCustomer(column: "id" | "token", value: string) {
  const { data, error } = await adminClient()
    .from("customers")
    .select(
      `id, first_name, token, stamps, rewards, cashback_balance, updated_at,
       cards (id, kind, name, stamps_goal, reward_name, cashback_percent, points_name,
              points_per_unit, bg_color, text_color, logo_url, terms),
       businesses (name, currency)`,
    )
    .eq(column, value)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as PassCustomer | null;
}

export interface PassCustomer {
  id: string;
  first_name: string;
  token: string;
  stamps: number;
  rewards: number;
  cashback_balance: number;
  updated_at: string;
  cards: {
    id: string;
    kind: "stamps" | "cashback";
    name: string;
    stamps_goal: number | null;
    reward_name: string | null;
    cashback_percent: number | null;
    points_name: string | null;
    points_per_unit: number;
    bg_color: string;
    text_color: string;
    logo_url: string | null;
    terms: string;
  };
  businesses: { name: string; currency: string };
}

export async function setWallet(customerId: string, wallet: "apple" | "google") {
  const { error } = await adminClient().from("customers").update({ wallet }).eq("id", customerId);
  if (error) console.error("setWallet", error);
}
