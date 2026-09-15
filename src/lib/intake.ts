import { supabase } from "@/integrations/supabase/client";
import { fmtDateTime24, fmtDuration } from "@/lib/format";

export type IntakeStatus = "open" | "pending_photo" | "finalized";

export interface IntakeSession {
  id: string;
  status: IntakeStatus;
  started_at: string;
  finished_at: string | null;
  finalized_at: string | null;
  image_url: string | null;
  supplier: string | null;
  created_by: string | null;
  created_by_name: string | null;
}

export interface IntakeItem {
  id: string;
  session_id: string;
  product_id: string | null;
  product_name: string;
  unit: string;
  quantity: number;
  unit_price: number;
  currency: string;
  location: string | null;
  order_id: string | null;
  source: string | null;
  phone: string | null;
  image_url: string | null;
  comment: string | null;
  created_at: string;
}

/** Nakladnoy identifikatori — sessiya boshlangan sana/vaqt: 12.09.2026 10:00 */
export function intakeCode(s: { started_at: string }): string {
  return fmtDateTime24(s.started_at);
}

/** Davomiylik: "1 soat 25 daqiqa" */
export function intakeDuration(s: { started_at: string; finished_at: string | null }): string {
  if (!s.finished_at) return "—";
  const ms = new Date(s.finished_at).getTime() - new Date(s.started_at).getTime();
  return fmtDuration(Math.round(ms / 60000));
}

export const INTAKE_STATUS_META: Record<IntakeStatus, { label: string; cls: string }> = {
  open: { label: "Kirim davom etmoqda", cls: "bg-status-yellow/15 text-status-yellow border-status-yellow/30" },
  pending_photo: { label: "Rasm kutilmoqda", cls: "bg-primary/10 text-primary border-primary/30" },
  finalized: { label: "Yakunlangan", cls: "bg-status-green/15 text-status-green border-status-green/30" },
};

/** Foydalanuvchining ochiq kirim sessiyasini qaytaradi (bo'lmasa null). */
export async function getOpenSession(userId: string): Promise<IntakeSession | null> {
  const { data } = await supabase
    .from("intake_sessions")
    .select("*")
    .eq("created_by", userId)
    .eq("status", "open")
    .maybeSingle();
  return (data as any) ?? null;
}

/** Ochiq sessiyani qaytaradi, bo'lmasa avtomatik yangisini boshlaydi. */
export async function getOrStartSession(
  userId: string,
  userName?: string | null,
  supplier?: string | null,
): Promise<IntakeSession> {
  const existing = await getOpenSession(userId);
  if (existing) {
    if (supplier && !existing.supplier) {
      await supabase.from("intake_sessions").update({ supplier }).eq("id", existing.id);
      existing.supplier = supplier;
    }
    return existing;
  }
  const { data, error } = await supabase
    .from("intake_sessions")
    .insert({ created_by: userId, created_by_name: userName ?? null, supplier: supplier ?? null } as any)
    .select("*")
    .single();
  if (error) {
    // Poyga holati: boshqa oynada ochilgan bo'lishi mumkin
    const again = await getOpenSession(userId);
    if (again) return again;
    throw error;
  }
  return data as any;
}

/** Kirim sessiyasini tugatish — Nakladnoy bo'limiga o'tadi (rasm kutilmoqda). */
export async function finishSession(sessionId: string) {
  const { error } = await supabase
    .from("intake_sessions")
    .update({ status: "pending_photo", finished_at: new Date().toISOString() } as any)
    .eq("id", sessionId)
    .eq("status", "open");
  if (error) throw error;
}

/** Nakladnoyni yakunlash — mahsulotlar sklad qoldig'iga kirim bo'ladi. */
export async function finalizeSession(sessionId: string) {
  const { error } = await supabase.rpc("finalize_intake_session" as any, { _session_id: sessionId });
  if (error) throw error;
}

/**
 * Kirim sessiyasiga mahsulot qo'shadi. Agar shu sessiyada xuddi shu mahsulot
 * allaqachon bo'lsa — yangi qator yaratilmaydi, miqdor jamlanadi
 * (narx o'rtacha og'irlikli qilib hisoblanadi).
 */
export async function addOrMergeItem(
  sessionId: string,
  payload: {
    product_id?: string | null;
    product_name: string;
    unit: string;
    quantity: number;
    unit_price: number;
    currency: string;
    [k: string]: any;
  },
) {
  const { data } = await supabase
    .from("intake_items")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  const list = ((data as any[]) ?? []) as IntakeItem[];
  const name = payload.product_name.trim().toLowerCase();
  const existing = list.find((i) =>
    payload.product_id
      ? i.product_id === payload.product_id
      : (i.product_name ?? "").trim().toLowerCase() === name,
  );

  if (existing && (existing.currency ?? "UZS") === (payload.currency ?? "UZS")) {
    const oldQty = Number(existing.quantity) || 0;
    const addQty = Number(payload.quantity) || 0;
    const newQty = oldQty + addQty;
    const newPrice =
      newQty > 0
        ? (oldQty * Number(existing.unit_price || 0) + addQty * Number(payload.unit_price || 0)) / newQty
        : Number(payload.unit_price || 0);
    const { error } = await supabase
      .from("intake_items")
      .update({ quantity: newQty, unit_price: newPrice } as any)
      .eq("id", existing.id);
    if (error) throw error;
    return { merged: true };
  }

  const { error } = await supabase
    .from("intake_items")
    .insert({ session_id: sessionId, ...payload } as any);
  if (error) throw error;
  return { merged: false };
}

export function itemsTotal(items: { quantity: number; unit_price: number }[]): number {
  return items.reduce((s, i) => s + Number(i.quantity || 0) * Number(i.unit_price || 0), 0);
}

/**
 * Tugatilmagan (draft) kirim sessiyalarini to'liq o'chiradi:
 * vaqtinchalik mahsulotlar + sessiyaning o'zi. Yakunlangan (finalized)
 * Nakladnoylarga umuman tegilmaydi — tarix saqlanadi.
 */
export async function discardDraftSessions(userId: string): Promise<number> {
  if (!userId) return 0;
  const { data } = await supabase
    .from("intake_sessions")
    .select("id")
    .eq("created_by", userId)
    .in("status", ["open", "pending_photo"]);
  const ids = ((data as any[]) ?? []).map((s) => s.id);
  if (!ids.length) return 0;
  await supabase.from("intake_items").delete().in("session_id", ids);
  await supabase.from("intake_sessions").delete().in("id", ids).neq("status", "finalized");
  return ids.length;
}

