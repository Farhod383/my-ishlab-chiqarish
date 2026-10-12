// Display-only: replaces login emails with the user's visible name (or role name).
// Auth emails stay untouched in the database; only what is shown changes.
import { supabase } from "@/integrations/supabase/client";

export const ROLE_DISPLAY: Record<string, string> = {
  admin: "Admin",
  manager: "Nachalnik",
  warehouse: "Sklad",
  supply: "Ta'minot",
  otk: "OTK",
  hr: "HR",
  cashier: "Kassir",
  chief_accountant: "Glavniy buxgalter",
  engineer: "Konstruktor",
  marketing: "Marketing",
  worker: "Ishchi",
};

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const byEmail = new Map<string, string>();
const byId = new Map<string, string>();
let listeners: Array<() => void> = [];

/** Picks the visible label: real full name, otherwise role name, otherwise "Foydalanuvchi". */
export function pickUserLabel(fullName: string | null | undefined, email: string | null | undefined, roles: string[] = []): string {
  const n = (fullName ?? "").trim();
  const local = (email ?? "").split("@")[0].toLowerCase();
  const nameIsLogin = !n || n.includes("@") || n.toLowerCase() === local;
  if (!nameIsLogin) return n;
  const role = roles.map((r) => ROLE_DISPLAY[r]).find(Boolean);
  return role ?? "Foydalanuvchi";
}

export async function loadUserNames(): Promise<void> {
  const [{ data: profs }, { data: roles }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email"),
    supabase.from("user_roles").select("user_id, role"),
  ]);
  const rmap = new Map<string, string[]>();
  (roles ?? []).forEach((r: any) => rmap.set(r.user_id, [...(rmap.get(r.user_id) ?? []), r.role]));
  (profs ?? []).forEach((p: any) => {
    const label = pickUserLabel(p.full_name, p.email, rmap.get(p.id) ?? []);
    byId.set(p.id, label);
    if (p.email) byEmail.set(String(p.email).toLowerCase(), label);
  });
  listeners.forEach((l) => l());
}

export function onUserNamesLoaded(fn: () => void) {
  listeners.push(fn);
  return () => { listeners = listeners.filter((x) => x !== fn); };
}

/** Replaces any email inside text with the matching user's visible name. */
export function displayUser(text: string | null | undefined): string {
  if (!text) return text ?? "";
  return String(text).replace(EMAIL_RE, (m) => byEmail.get(m.toLowerCase()) ?? m.split("@")[0]);
}

export function userLabelById(id: string | null | undefined): string | undefined {
  return id ? byId.get(id) : undefined;
}

/** Name to store on new records for the signed-in user (never the email). */
export function currentUserName(user: { id?: string; email?: string | null; user_metadata?: any } | null | undefined): string | null {
  if (!user) return null;
  return byId.get(user.id ?? "")
    ?? pickUserLabel(user.user_metadata?.full_name, user.email, [])
    ?? null;
}
