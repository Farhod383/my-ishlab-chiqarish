// Shared helpers for the Face ID (Hikvision) integration.
import { createClient } from "npm:@supabase/supabase-js@2";

export const admin = () =>
  createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

export type Site = "zavod" | "office";

export interface NormalizedEvent {
  site: Site;
  person_code: string;
  person_name?: string | null;
  direction: "in" | "out";
  event_time: string; // ISO
  raw?: unknown;
}

/** Work date for an event, shifting night-shift early-morning punches to the previous day. */
export function workDateFor(eventTimeISO: string, crossesMidnight: boolean): string {
  const d = new Date(eventTimeISO);
  // Tashkent is UTC+5; compute local calendar day.
  const local = new Date(d.getTime() + 5 * 3600_000);
  if (crossesMidnight && local.getUTCHours() < 12) {
    local.setUTCDate(local.getUTCDate() - 1);
  }
  return local.toISOString().slice(0, 10);
}

/**
 * Persist normalized events: resolves employee by hikvision_person_id,
 * derives the work date from the employee's shift and de-duplicates.
 */
export async function storeEvents(
  db: ReturnType<typeof admin>,
  deviceId: string | null,
  events: NormalizedEvent[],
) {
  if (!events.length) return { inserted: 0 };

  const codes = [...new Set(events.map((e) => e.person_code))];
  const { data: emps } = await db
    .from("employees")
    .select("id, hikvision_person_id, shift_id, face_shifts:shift_id(crosses_midnight)")
    .in("hikvision_person_id", codes);

  const byCode = new Map<string, any>();
  (emps ?? []).forEach((e: any) => byCode.set(String(e.hikvision_person_id), e));

  const rows = events.map((e) => {
    const emp = byCode.get(e.person_code);
    const crosses = Boolean(emp?.face_shifts?.crosses_midnight);
    return {
      device_id: deviceId,
      site: e.site,
      person_code: e.person_code,
      person_name: e.person_name ?? null,
      employee_id: emp?.id ?? null,
      direction: e.direction,
      event_time: e.event_time,
      work_date: workDateFor(e.event_time, crosses),
      raw: (e.raw ?? null) as any,
    };
  });

  const { data, error } = await db
    .from("face_events")
    .upsert(rows, { onConflict: "site,person_code,direction,event_time", ignoreDuplicates: true })
    .select("id");
  if (error) throw error;

  const lastEvent = rows.map((r) => r.event_time).sort().at(-1) ?? null;
  if (deviceId) {
    await db.from("face_devices").update({
      last_event_at: lastEvent,
      last_sync_at: new Date().toISOString(),
      status: "online",
      last_error: null,
    }).eq("id", deviceId);
  }
  return { inserted: data?.length ?? 0 };
}
