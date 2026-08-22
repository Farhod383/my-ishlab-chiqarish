// Ingest endpoint for the on-premise Hikvision bridge / device HTTP listening host.
// Protected by a shared token (FACEID_INGEST_TOKEN) — never exposed to the frontend.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { admin, storeEvents, type NormalizedEvent, type Site } from "../_shared/faceid.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function normalizeDirection(v: unknown, fallback: "in" | "out"): "in" | "out" {
  const s = String(v ?? "").toLowerCase();
  if (["in", "checkin", "check-in", "entry", "keldim", "1"].includes(s)) return "in";
  if (["out", "checkout", "check-out", "exit", "ketdim", "0"].includes(s)) return "out";
  return fallback;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const token = Deno.env.get("FACEID_INGEST_TOKEN");
  const provided = req.headers.get("x-faceid-token") ?? "";
  if (!token || provided !== token) return json({ error: "Unauthorized" }, 401);

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const list: any[] = Array.isArray(payload) ? payload : Array.isArray(payload?.events) ? payload.events : [payload];
  if (!list.length) return json({ error: "No events provided" }, 400);

  const db = admin();
  const { data: devices } = await db.from("face_devices").select("id, site, ip_address");

  const errors: string[] = [];
  const normalized: NormalizedEvent[] = [];
  let deviceId: string | null = null;

  for (const [i, e] of list.entries()) {
    const site = String(e?.site ?? "").toLowerCase() as Site;
    const code = String(e?.person_code ?? e?.employeeNoString ?? e?.employeeNo ?? "").trim();
    const time = e?.event_time ?? e?.time ?? e?.dateTime;
    if (site !== "zavod" && site !== "office") { errors.push(`#${i}: site must be zavod|office`); continue; }
    if (!code) { errors.push(`#${i}: person_code is required`); continue; }
    const t = new Date(time ?? "");
    if (Number.isNaN(t.getTime())) { errors.push(`#${i}: invalid event_time`); continue; }

    const dev = (devices ?? []).find((d: any) => d.site === site);
    deviceId = dev?.id ?? deviceId;
    normalized.push({
      site,
      person_code: code,
      person_name: e?.person_name ?? e?.name ?? null,
      direction: normalizeDirection(e?.direction ?? e?.attendanceStatus, "in"),
      event_time: t.toISOString(),
      raw: e,
    });
  }

  if (!normalized.length) return json({ error: "No valid events", details: errors }, 400);

  try {
    const res = await storeEvents(db, deviceId, normalized);
    return json({ ok: true, received: list.length, stored: res.inserted, skipped: errors });
  } catch (err) {
    return json({ error: String((err as Error).message ?? err) }, 500);
  }
});
