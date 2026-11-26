// Apple PassKit web service (iOS calls it directly, no Supabase JWT):
//   POST   /v1/devices/{device}/registrations/{passType}/{serial}  register for updates
//   DELETE /v1/devices/{device}/registrations/{passType}/{serial}  unregister
//   GET    /v1/devices/{device}/registrations/{passType}?passesUpdatedSince=<tag>
//   GET    /v1/passes/{passType}/{serial}                          latest pass
//   POST   /v1/log                                                 device logs
// serial = customer id. Auth header: "ApplePass <HMAC(serial)>".

import { adminClient, json, loadCustomer } from "../_shared/http.ts";
import { buildPkpass, isAuthorized } from "../_shared/apple.ts";

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const parts = url.pathname.replace(/^.*\/apple-webservice/, "").split("/").filter(Boolean);
    const db = adminClient();

    if (req.method === "POST" && parts[1] === "log") {
      console.log("passkit-log:", JSON.stringify(await req.json().catch(() => ({}))));
      return new Response(null, { status: 200 });
    }

    if (parts[1] === "devices" && parts[3] === "registrations") {
      const deviceId = parts[2];
      const serial = parts[5];

      if (req.method === "POST" && serial) {
        if (!(await isAuthorized(req, serial))) return new Response(null, { status: 401 });
        const { pushToken } = await req.json().catch(() => ({}));
        if (!pushToken) return new Response(null, { status: 400 });
        const { error } = await db.from("apple_registrations").upsert(
          { device_id: deviceId, customer_id: serial, push_token: pushToken },
          { onConflict: "device_id,customer_id" },
        );
        if (error) throw error;
        return new Response(null, { status: 201 });
      }

      if (req.method === "DELETE" && serial) {
        if (!(await isAuthorized(req, serial))) return new Response(null, { status: 401 });
        await db.from("apple_registrations").delete().eq("device_id", deviceId).eq("customer_id", serial);
        return new Response(null, { status: 200 });
      }

      if (req.method === "GET") {
        const since = Number(url.searchParams.get("passesUpdatedSince") ?? 0) * 1000;
        const { data, error } = await db
          .from("apple_registrations")
          .select("customer_id, customers(updated_at)")
          .eq("device_id", deviceId);
        if (error) throw error;
        if (!data?.length) return new Response(null, { status: 404 });
        const updated = data.filter((r) => {
          const c = r.customers as unknown as { updated_at: string } | null;
          return c && Date.parse(c.updated_at) > since;
        });
        if (updated.length === 0) return new Response(null, { status: 204 });
        return json({
          serialNumbers: updated.map((r) => r.customer_id),
          lastUpdated: String(Math.floor(Date.now() / 1000)),
        });
      }
    }

    if (req.method === "GET" && parts[1] === "passes" && parts[3]) {
      const serial = parts[3];
      if (!(await isAuthorized(req, serial))) return new Response(null, { status: 401 });
      const customer = await loadCustomer("id", serial);
      if (!customer) return new Response(null, { status: 404 });
      return new Response(await buildPkpass(customer), {
        headers: {
          "Content-Type": "application/vnd.apple.pkpass",
          "Last-Modified": new Date(customer.updated_at).toUTCString(),
        },
      });
    }

    return new Response(null, { status: 404 });
  } catch (err) {
    console.error("apple-webservice:", err);
    return json({ error: "internal_error" }, 500);
  }
});
