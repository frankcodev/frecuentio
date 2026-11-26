// Google Wallet: "Save to Google Wallet" link (signed JWT with the class and
// object inside) and REST updates of the object when the balance changes.
// Optional: without the GOOGLE_* secrets the functions answer 503.

import { howItWorks, mainBalance, secondaryBalance } from "./balance.ts";
import type { PassCustomer } from "./http.ts";

const API = "https://walletobjects.googleapis.com/walletobjects/v1";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

let accessToken: { token: string; expires: number } | null = null;

export function googleConfigured(): boolean {
  return Boolean(Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON") && Deno.env.get("GOOGLE_ISSUER_ID"));
}

function serviceAccount(): { client_email: string; private_key: string } {
  return JSON.parse(Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON")!);
}

function b64url(data: Uint8Array | string): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  let s = "";
  for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function signRs256(payload: object): Promise<string> {
  const pem = serviceAccount().private_key.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s/g, "");
  const key = await crypto.subtle.importKey(
    "pkcs8",
    Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const unsigned = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(JSON.stringify(payload))}`;
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${b64url(new Uint8Array(sig))}`;
}

const issuer = () => Deno.env.get("GOOGLE_ISSUER_ID")!;
// Google ids allow [A-Za-z0-9._-]; one class per card, one object per customer
const classId = (cardId: string) => `${issuer()}.card_${cardId.replace(/-/g, "")}`;
const objectId = (customerId: string) => `${issuer()}.customer_${customerId.replace(/-/g, "")}`;

function loyaltyClass(c: PassCustomer) {
  return {
    id: classId(c.cards.id),
    issuerName: c.businesses.name,
    programName: c.cards.name,
    ...(c.cards.logo_url && {
      programLogo: {
        sourceUri: { uri: c.cards.logo_url },
        contentDescription: { defaultValue: { language: "es", value: c.businesses.name } },
      },
    }),
    hexBackgroundColor: c.cards.bg_color,
    reviewStatus: "UNDER_REVIEW",
    textModulesData: [
      { id: "how", header: "Cómo funciona", body: howItWorks(c.cards, c.businesses.currency) },
      ...(c.cards.terms ? [{ id: "terms", header: "Términos", body: c.cards.terms.slice(0, 500) }] : []),
    ],
  };
}

/** The fields that change with the balance (used for the JWT and the PATCH). */
function balanceFields(c: PassCustomer) {
  const main = mainBalance(c.cards, c, c.businesses.currency);
  const second = secondaryBalance(c.cards, c);
  return {
    loyaltyPoints: { label: main.label, balance: { string: main.value } },
    secondaryLoyaltyPoints: { label: second.label, balance: { string: second.value } },
  };
}

function loyaltyObject(c: PassCustomer) {
  return {
    id: objectId(c.id),
    classId: classId(c.cards.id),
    state: "ACTIVE",
    accountId: c.id,
    accountName: c.first_name,
    ...balanceFields(c),
    barcode: { type: "QR_CODE", value: c.token, alternateText: c.first_name },
  };
}

export async function saveUrl(c: PassCustomer): Promise<string> {
  const jwt = await signRs256({
    iss: serviceAccount().client_email,
    aud: "google",
    typ: "savetowallet",
    iat: Math.floor(Date.now() / 1000),
    payload: { loyaltyClasses: [loyaltyClass(c)], loyaltyObjects: [loyaltyObject(c)] },
  });
  return `https://pay.google.com/gp/v/save/${jwt}`;
}

async function apiToken(): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000);
  if (accessToken && accessToken.expires > now + 60) return accessToken.token;
  const assertion = await signRs256({
    iss: serviceAccount().client_email,
    scope: "https://www.googleapis.com/auth/wallet_object.issuer",
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!res.ok) {
    console.error("Google OAuth", res.status, await res.text());
    return null;
  }
  const data = await res.json() as { access_token: string; expires_in?: number };
  accessToken = { token: data.access_token, expires: now + (data.expires_in ?? 3600) };
  return data.access_token;
}

/** Pushes the new balance to the saved pass. 404 = never saved to Google Wallet. */
export async function updateObject(c: PassCustomer): Promise<boolean> {
  if (!googleConfigured()) return false;
  const token = await apiToken();
  if (!token) return false;
  const res = await fetch(`${API}/loyaltyObject/${encodeURIComponent(objectId(c.id))}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(balanceFields(c)),
  });
  if (res.status === 404) return false;
  if (!res.ok) console.error("Google PATCH loyaltyObject", res.status, await res.text());
  return res.ok;
}
