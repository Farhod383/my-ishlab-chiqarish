// «Shassi» moduli: umumiy turlar, holatlar va bazaga murojaat.
// Holatni faqat bazadagi funksiyalar o'zgartiradi; bu yerda hech qanday summa yakuniy hisoblanmaydi.
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/auth/AuthContext";

// Yangi jadvallar Lovable tiplarni qayta yaratguncha `types.ts`da yo'q — shuning uchun tipsiz mijoz
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const cdb = supabase as any;

export type ChassisStatus = "expected" | "received" | "in_production" | "ready" | "in_act" | "shipped" | "esf_issued" | "closed" | "returned_without_work";
export type ActStatus = "draft" | "shipped" | "esf_issued" | "closed" | "void";

export const CHASSIS_FLOW: ChassisStatus[] = ["expected", "received", "in_production", "ready", "in_act", "shipped", "esf_issued", "closed"];

/** Rang: ERP status ranglari (status-green/yellow/red/blue) */
export const CHASSIS_TONE: Record<ChassisStatus, string> = {
  expected: "bg-muted text-muted-foreground border-border",
  received: "bg-status-blue/10 text-status-blue border-status-blue/30",
  in_production: "bg-status-yellow/15 text-status-yellow border-status-yellow/30",
  ready: "bg-status-green/10 text-status-green border-status-green/30",
  in_act: "bg-primary/10 text-primary border-primary/30",
  shipped: "bg-status-blue/10 text-status-blue border-status-blue/30",
  esf_issued: "bg-primary/10 text-primary border-primary/30",
  closed: "bg-muted text-muted-foreground border-border",
  returned_without_work: "bg-status-red/10 text-status-red border-status-red/30",
};
export const ACT_TONE: Record<ActStatus, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  shipped: "bg-status-blue/10 text-status-blue border-status-blue/30",
  esf_issued: "bg-primary/10 text-primary border-primary/30",
  closed: "bg-status-green/10 text-status-green border-status-green/30",
  void: "bg-status-red/10 text-status-red border-status-red/30",
};

/** Rollar (bazadagi funksiyalar bilan bir xil). Admin hammasini qila oladi. */
export const CHASSIS_ROLES = {
  view: ["admin", "manager", "marketing", "warehouse", "otk", "engineer", "accountant", "chief_accountant"] as AppRole[],
  expect: ["warehouse"] as AppRole[],
  receive: ["warehouse"] as AppRole[],
  ship: ["warehouse"] as AppRole[],
  production: ["engineer", "manager"] as AppRole[],
  ready: ["otk"] as AppRole[],
  act: ["marketing", "manager"] as AppRole[],
  esf: ["accountant", "chief_accountant"] as AppRole[],
  specs: ["chief_accountant"] as AppRole[],
};
export type ChassisAction = keyof typeof CHASSIS_ROLES;

/** Keyingi qadam: holat → amal */
export const NEXT_ACTION: Partial<Record<ChassisStatus, ChassisAction>> = {
  expected: "receive", received: "production", in_production: "ready", ready: "act", in_act: "ship", shipped: "esf", esf_issued: "esf",
};

/** Ekranda tez ko'rsatish uchun; yakuniy tekshiruv bazada (chassis_normalize_vin) */
export function normalizeVin(raw: string): string {
  return raw.toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/I/g, "1");
}
export type VinCheck = { vin: string; state: "empty" | "short" | "long" | "bad" | "ok" };
export function checkVin(raw: string): VinCheck {
  const vin = normalizeVin(raw);
  if (!vin) return { vin, state: "empty" };
  if (/[^A-HJ-NPR-Z0-9]/.test(vin)) return { vin, state: "bad" };
  if (vin.length < 17) return { vin, state: "short" };
  if (vin.length > 17) return { vin, state: "long" };
  return { vin, state: "ok" };
}

/** Qidiruv: to'liq VIN, VIN oxiri (4–6 belgi), dvigatel, zakaz, akt, ESF */
export function matchesChassis(row: { vin: string; engine_no?: string | null; order_number?: string | null; act_no?: string | null; esf_number?: string | null; client_name?: string | null }, q: string): boolean {
  const needle = q.trim().toUpperCase();
  if (!needle) return true;
  const vinNeedle = normalizeVin(needle);
  if (row.vin.includes(vinNeedle) || row.vin.endsWith(vinNeedle)) return true;
  return [row.engine_no, row.order_number, row.act_no, row.esf_number, row.client_name]
    .some((v) => (v ?? "").toUpperCase().includes(needle));
}

/** RPC chaqiruvi: xato bo'lsa bazaning tushunarli xabarini qaytaradi */
export async function chassisRpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await cdb.rpc(fn, args);
  if (error) throw new Error(cleanDbError(error.message));
  return data as T;
}
/** Shassi qabulini 1C:УК ga qoralama «Приходная накладная» qilib yuboradi (edge function onec-chassis-intake). */
export async function sendIntakeTo1C(chassisId: string, force = false): Promise<{ ok?: boolean; number?: string; already?: boolean; contract?: string }> {
  const { data, error } = await cdb.functions.invoke("onec-chassis-intake", { body: { chassisId, force } });
  if (error) {
    let msg = error.message;
    try { const j = await (error as any).context?.json?.(); if (j?.error) msg = j.error; } catch { /* javob JSON emas */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data ?? {};
}

export function cleanDbError(msg: string): string {
  return String(msg ?? "").replace(/^.*?ERROR:\s*/i, "").replace(/\s*\(SQLSTATE.*$/, "").trim() || "Amal bajarilmadi";
}

export const fmtSum = (n: number | string | null | undefined) =>
  n == null || n === "" ? "—" : new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(n)).replace(/,/g, ".");

export const CHASSIS_PHOTO_BUCKET = "chassis-photos";
