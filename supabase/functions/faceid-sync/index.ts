// Pulls attendance events straight from Hikvision terminals over ISAPI (digest auth).
// Device IPs and credentials come from environment secrets only.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import md5 from "npm:blueimp-md5@2.19.0";
import { createClient } from "npm:@supabase/supabase-js@2";
import { admin, storeEvents, type NormalizedEvent, type Site } from "../_shared/faceid.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function parseDigest(header: string) {
  const out: Record<string, string> = {};
  header.replace(/^Digest\s+/i, "").split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).forEach((p) => {
    const idx = p.indexOf("=");
    if (idx > 0) out[p.slice(0, idx).trim()] = p.slice(idx + 1).trim().replace(/^"|"$/g, "");
  });
  return out;
}

async function digestFetch(url: string, user: string, pass: string, body: string, timeoutMs = 8000) {
  const method = "POST";
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const first = await fetch(url, { method, body, signal: ctl.signal });
    if (first.status !== 401) return first;
    const wa = first.headers.get("www-authenticate") ?? "";
    const d = parseDigest(wa);
    const uri = new URL(url).pathname + new URL(url).search;
    const nc = "00000001";
    const cnonce = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    const ha1 = md5(`${user}:${d.realm}:${pass}`);
    const ha2 = md5(`${method}:${uri}`);
    const qop = d.qop?.split(",")[0]?.trim() || "auth";
    const response = md5(`${ha1}:${d.nonce}:${nc}:${cnonce}:${qop}:${ha2}`);
    const auth =
      `Digest username="${user}", realm="${d.realm}", nonce="${d.nonce}", uri="${uri}", ` +
      `qop=${qop}, nc=${nc}, cnonce="${cnonce}", response="${response}"` +
      (d.opaque ? `, opaque="${d.opaque}"` : "");
    return await fetch(url, { method, body, headers: { Authorization: auth }, signal: ctl.signal });
  } finally {
    clearTimeout(timer);
  }
}

function isoRange(hoursBack: number) {
  const end = new Date();
  const start = new Date(end.getTime() - hoursBack * 3600_000);
  const fmt = (d: Date) => d.toISOString().replace(".000", "").replace("Z", "+05:00");
  return { start: fmt(start), end: fmt(end) };
}

async function pullDevice(site: Site, ip: string, user: string, pass: string, hoursBack: number) {
  const url = `http://${ip}/ISAPI/AccessControl/AcsEvent?format=json`;
  const { start, end } = isoRange(hoursBack);
  const events: NormalizedEvent[] = [];
  let position = 0;

  for (let page = 0; page < 20; page++) {
    const body = JSON.stringify({
      AcsEventCond: {
        searchID: crypto.randomUUID(),
        searchResultPosition: position,
        maxResults: 50,
        major: 5,
        minor: 75,
        startTime: start,
        endTime: end,
      },
    });
    const res = await digestFetch(url, user, pass, body);
    if (!res.ok) throw new Error(`ISAPI ${res.status}`);
    const data = await res.json();
    const info = data?.AcsEvent?.InfoList ?? [];
    for (const it of info) {
      const code = String(it.employeeNoString ?? it.employeeNo ?? "").trim();
      if (!code || !it.time) continue;
      const status = String(it.attendanceStatus ?? "").toLowerCase();
      events.push({
        site,
        person_code: code,
        person_name: it.name ?? null,
        direction: status.includes("out") ? "out" : status.includes("in") ? "in" : "in",
        event_time: new Date(it.time).toISOString(),
        raw: it,
      });
    }
    const total = Number(data?.AcsEvent?.totalMatches ?? 0);
    position += Number(data?.AcsEvent?.numOfMatches ?? info.length);
    if (!info.length || position >= total) break;
  }
  return events;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Require a signed-in Admin/HR user.
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return json({ error: "Unauthorized" }, 401);
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);
  const { data: roles } = await userClient.from("user_roles").select("role").eq("user_id", user.id);
  const allowed = (roles ?? []).some((r: any) => r.role === "admin" || r.role === "hr");
  if (!allowed) return json({ error: "Faqat Admin va HR sinxronlashi mumkin" }, 403);

  let hoursBack = 24;
  try {
    const b = await req.json();
    if (Number(b?.hoursBack) > 0) hoursBack = Math.min(Number(b.hoursBack), 24 * 31);
  } catch { /* default */ }

  const db = admin();
  const { data: devices } = await db.from("face_devices").select("id, site, ip_address");

  const cfg: Record<Site, { ip?: string; user?: string; pass?: string }> = {
    zavod: {
      ip: Deno.env.get("HIKVISION_ZAVOD_IP") ?? undefined,
      user: Deno.env.get("HIKVISION_ZAVOD_USER") ?? undefined,
      pass: Deno.env.get("HIKVISION_ZAVOD_PASSWORD") ?? undefined,
    },
    office: {
      ip: Deno.env.get("HIKVISION_OFFICE_IP") ?? undefined,
      user: Deno.env.get("HIKVISION_OFFICE_USER") ?? undefined,
      pass: Deno.env.get("HIKVISION_OFFICE_PASSWORD") ?? undefined,
    },
  };

  const results: any[] = [];
  for (const dev of devices ?? []) {
    const site = dev.site as Site;
    const c = cfg[site];
    const ip = c.ip || dev.ip_address;
    if (!ip || !c.user || !c.pass) {
      await db.from("face_devices").update({
        status: "unknown",
        last_sync_at: new Date().toISOString(),
        last_error: "Qurilma login/parol sozlanmagan (environment secret)",
      }).eq("id", dev.id);
      results.push({ site, ok: false, error: "credentials_missing" });
      continue;
    }
    try {
      const events = await pullDevice(site, ip, c.user, c.pass, hoursBack);
      const stored = await storeEvents(db, dev.id, events);
      results.push({ site, ok: true, fetched: events.length, stored: stored.inserted });
      if (!events.length) {
        await db.from("face_devices").update({
          status: "online", last_sync_at: new Date().toISOString(), last_error: null,
        }).eq("id", dev.id);
      }
    } catch (err) {
      const msg = String((err as Error).message ?? err);
      await db.from("face_devices").update({
        status: "offline",
        last_sync_at: new Date().toISOString(),
        last_error: msg.slice(0, 300),
      }).eq("id", dev.id);
      results.push({ site, ok: false, error: msg });
    }
  }

  return json({ ok: true, results });
});
