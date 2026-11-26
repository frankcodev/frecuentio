// GET /google-pass?token=<customer token> → redirect to "Save to Google Wallet"

import { json, loadCustomer, setWallet } from "../_shared/http.ts";
import { googleConfigured, saveUrl } from "../_shared/google.ts";

const UUID = /^[0-9a-f-]{36}$/i;

Deno.serve(async (req) => {
  try {
    if (!googleConfigured()) return json({ error: "google_wallet_not_configured" }, 503);
    const token = new URL(req.url).searchParams.get("token") ?? "";
    if (!UUID.test(token)) return json({ error: "invalid_token" }, 400);

    const customer = await loadCustomer("token", token);
    if (!customer) return json({ error: "card_not_found" }, 404);

    await setWallet(customer.id, "google");
    return Response.redirect(await saveUrl(customer), 302);
  } catch (err) {
    console.error("google-pass:", err);
    return json({ error: "internal_error" }, 500);
  }
});
