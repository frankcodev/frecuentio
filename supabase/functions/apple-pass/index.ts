// GET /apple-pass?token=<customer token> → the .pkpass (public link from the card page)

import { json, loadCustomer, setWallet } from "../_shared/http.ts";
import { appleConfigured, buildPkpass } from "../_shared/apple.ts";

const UUID = /^[0-9a-f-]{36}$/i;

Deno.serve(async (req) => {
  try {
    if (!appleConfigured()) return json({ error: "apple_wallet_not_configured" }, 503);
    const token = new URL(req.url).searchParams.get("token") ?? "";
    if (!UUID.test(token)) return json({ error: "invalid_token" }, 400);

    const customer = await loadCustomer("token", token);
    if (!customer) return json({ error: "card_not_found" }, 404);

    const pkpass = await buildPkpass(customer);
    await setWallet(customer.id, "apple");
    return new Response(pkpass, {
      headers: {
        "Content-Type": "application/vnd.apple.pkpass",
        "Content-Disposition": `attachment; filename="tarjeta.pkpass"`,
      },
    });
  } catch (err) {
    console.error("apple-pass:", err);
    return json({ error: "internal_error" }, 500);
  }
});
