// Apple Wallet: build and sign the .pkpass, authenticate the PassKit web
// service and send the silent push that makes iPhones fetch the new pass.
// Everything is optional: without the APPLE_* secrets the functions answer
// 503 and the customer uses the web card.

import forge from "npm:node-forge@1";
import JSZip from "npm:jszip@3";
import { howItWorks, mainBalance, secondaryBalance } from "./balance.ts";
import type { PassCustomer } from "./http.ts";

const WWDR_URL = "https://www.apple.com/certificateauthority/AppleWWDRCAG4.cer";
// Neutral 58x58 grey PNG used when the business has no logo
const FALLBACK_ICON =
  "iVBORw0KGgoAAAANSUhEUgAAADoAAAA6CAIAAABu2d1/AAAAS0lEQVR4nO3OQQ0AMAgEMPz75IOKWdjvIGlSAa3uOaTiA901dHV1dXV1dXV103R1dXV1dXV1ddN0dXV1dXV1dXXTdHV1dXV1dXV/PPvOh14dfkDcAAAAAElFTkSuQmCC";

let wwdr: forge.pki.Certificate | null = null;
let apnsJwt: { token: string; expires: number } | null = null;

export function appleConfigured(): boolean {
  return ["APPLE_PASS_TYPE_ID", "APPLE_TEAM_ID", "APPLE_CERT_P12_BASE64", "APPLE_CERT_PASSWORD", "PASS_SECRET"]
    .every((k) => Boolean(Deno.env.get(k)));
}

/** PassKit authenticationToken: HMAC(serial), so nothing has to be stored. */
export async function authToken(serial: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(Deno.env.get("PASS_SECRET")!),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(serial));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function isAuthorized(req: Request, serial: string): Promise<boolean> {
  const header = req.headers.get("Authorization") ?? "";
  return header.startsWith("ApplePass ") && header.slice(10) === (await authToken(serial));
}

function rgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 0xff}, ${(n >> 8) & 0xff}, ${n & 0xff})`;
}

// forge wants binary strings; convert in chunks so big logos don't blow the stack
function binary(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return s;
}

async function wwdrCertificate(): Promise<forge.pki.Certificate> {
  if (wwdr) return wwdr;
  const res = await fetch(WWDR_URL);
  if (!res.ok) throw new Error(`WWDR download failed: ${res.status}`);
  const der = new Uint8Array(await res.arrayBuffer());
  wwdr = forge.pki.certificateFromAsn1(forge.asn1.fromDer(forge.util.createBuffer(binary(der))));
  return wwdr;
}

/** The signed .pkpass for a customer. Serial number = customer id. */
export async function buildPkpass(customer: PassCustomer): Promise<ArrayBuffer> {
  const card = customer.cards;
  const currency = customer.businesses.currency;
  const main = mainBalance(card, customer, currency);
  const second = secondaryBalance(card, customer);

  const passJson = {
    formatVersion: 1,
    passTypeIdentifier: Deno.env.get("APPLE_PASS_TYPE_ID"),
    teamIdentifier: Deno.env.get("APPLE_TEAM_ID"),
    serialNumber: customer.id,
    organizationName: customer.businesses.name,
    description: card.name,
    logoText: customer.businesses.name,
    backgroundColor: rgb(card.bg_color),
    foregroundColor: rgb(card.text_color),
    labelColor: rgb(card.text_color),
    webServiceURL: `${Deno.env.get("SUPABASE_URL")}/functions/v1/apple-webservice`,
    authenticationToken: await authToken(customer.id),
    storeCard: {
      primaryFields: [{ key: "balance", label: main.label, value: main.value }],
      secondaryFields: [
        { key: "name", label: "Cliente", value: customer.first_name },
        { key: "second", label: second.label, value: second.value },
      ],
      backFields: [
        { key: "how", label: "Cómo funciona", value: howItWorks(card, currency) },
        ...(card.terms ? [{ key: "terms", label: "Términos", value: card.terms }] : []),
      ],
    },
    barcodes: [{ format: "PKBarcodeFormatQR", message: customer.token, messageEncoding: "iso-8859-1" }],
  };

  let logo = Uint8Array.from(atob(FALLBACK_ICON), (c) => c.charCodeAt(0));
  if (card.logo_url) {
    try {
      const res = await fetch(card.logo_url);
      if (res.ok) logo = new Uint8Array(await res.arrayBuffer());
    } catch (e) {
      console.error("apple: logo download failed, using fallback", e);
    }
  }

  const files: Record<string, Uint8Array> = {
    "pass.json": new TextEncoder().encode(JSON.stringify(passJson)),
    "icon.png": logo,
    "icon@2x.png": logo,
    "logo.png": logo,
    "logo@2x.png": logo,
  };

  // manifest.json = SHA-1 of every file, signed (PKCS#7 detached) with the Pass Type ID cert
  const manifest: Record<string, string> = {};
  for (const [name, content] of Object.entries(files)) {
    const md = forge.md.sha1.create();
    md.update(binary(content), "raw");
    manifest[name] = md.digest().toHex();
  }
  const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest));

  const p12 = forge.pkcs12.pkcs12FromAsn1(
    forge.asn1.fromDer(forge.util.decode64(Deno.env.get("APPLE_CERT_P12_BASE64")!)),
    Deno.env.get("APPLE_CERT_PASSWORD")!,
  );
  const cert = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]?.[0]?.cert;
  const key = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0]
    ?.key;
  if (!cert || !key) throw new Error("The .p12 has no certificate or private key");

  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(binary(manifestBytes));
  p7.addCertificate(cert);
  p7.addCertificate(await wwdrCertificate());
  p7.addSigner({
    key,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha1,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() as unknown as string },
    ],
  });
  p7.sign({ detached: true });
  const signature = forge.util.binary.raw.decode(forge.asn1.toDer(p7.toAsn1()).getBytes());

  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) zip.file(name, content);
  zip.file("manifest.json", manifestBytes);
  zip.file("signature", signature);
  return await zip.generateAsync({ type: "arraybuffer" });
}

// ── APNs (token auth, .p8 key) ──────────────────────────────────────────

function apnsConfigured(): boolean {
  return ["APPLE_APNS_KEY_P8_BASE64", "APPLE_APNS_KEY_ID", "APPLE_TEAM_ID", "APPLE_PASS_TYPE_ID"]
    .every((k) => Boolean(Deno.env.get(k)));
}

function b64url(data: Uint8Array | string): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function apnsToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (apnsJwt && apnsJwt.expires > now + 60) return apnsJwt.token;
  const pem = atob(Deno.env.get("APPLE_APNS_KEY_P8_BASE64")!);
  const body = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s/g, "");
  const key = await crypto.subtle.importKey(
    "pkcs8",
    Uint8Array.from(atob(body), (c) => c.charCodeAt(0)),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const head = b64url(JSON.stringify({ alg: "ES256", kid: Deno.env.get("APPLE_APNS_KEY_ID") }));
  const claims = b64url(JSON.stringify({ iss: Deno.env.get("APPLE_TEAM_ID"), iat: now }));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(`${head}.${claims}`));
  const token = `${head}.${claims}.${b64url(new Uint8Array(sig))}`;
  apnsJwt = { token, expires: now + 45 * 60 }; // APNs accepts tokens younger than 60 min
  return token;
}

/** Empty push: the iPhone then asks apple-webservice for the updated pass. */
export async function pushPassUpdate(pushTokens: string[]): Promise<number> {
  if (pushTokens.length === 0 || !apnsConfigured()) return 0;
  const jwt = await apnsToken();
  const results = await Promise.all(pushTokens.map(async (pushToken) => {
    const res = await fetch(`https://api.push.apple.com/3/device/${pushToken}`, {
      method: "POST",
      headers: {
        authorization: `bearer ${jwt}`,
        "apns-topic": Deno.env.get("APPLE_PASS_TYPE_ID")!,
        "apns-push-type": "background",
      },
      body: JSON.stringify({ aps: { "content-available": 1 } }),
    });
    if (!res.ok) console.error("APNs", res.status, await res.text());
    return res.ok;
  }));
  return results.filter(Boolean).length;
}
