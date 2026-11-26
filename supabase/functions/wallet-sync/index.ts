// POST { customer_id } (business JWT) → refreshes the customer's wallet passes
// after a purchase or redemption. The panel calls it fire-and-forget.

import { createClient } from "npm:@supabase/supabase-js@2";
import { adminClient, corsHeaders, json, loadCustomer } from "../_shared/http.ts";
import { pushPassUpdate } from "../_shared/apple.ts";
import { updateObject } from "../_shared/google.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  try {
    const { customer_id } = await req.json().catch(() => ({}));
    if (typeof customer_id !== "string") return json({ error: "customer_id_required" }, 400);

    // Ownership check with the caller's own session: RLS only returns their customers
    const asUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: owned } = await asUser.from("customers").select("id").eq("id", customer_id).maybeSingle();
    if (!owned) return json({ error: "customer_not_found" }, 404);

    const customer = await loadCustomer("id", customer_id);
    if (!customer) return json({ error: "customer_not_found" }, 404);

    const { data: devices } = await adminClient()
      .from("apple_registrations")
      .select("push_token")
      .eq("customer_id", customer_id);
    const [apple, google] = await Promise.all([
      pushPassUpdate((devices ?? []).map((d) => d.push_token)),
      updateObject(customer),
    ]);
    return json({ apple_devices: apple, google_updated: google });
  } catch (err) {
    console.error("wallet-sync:", err);
    return json({ error: "internal_error" }, 500);
  }
});
