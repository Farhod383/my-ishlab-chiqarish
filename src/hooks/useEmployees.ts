import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface CentralEmployee {
  id: string;
  full_name: string;
  position: string | null;
  department: string | null;
  phone: string | null;
  status: string | null;
  [key: string]: any;
}

/**
 * Central HR employee registry.
 *
 * One shared cache + one realtime subscription for the whole app: employees are
 * created / edited / deactivated only in HR (or Kassa), and every module
 * (Sklad, Nachalnik, Ishlab chiqarish, Ta'minot, OTK, Remont, Brak, Vozvrat...)
 * reads from here, so changes propagate everywhere instantly.
 */
let cache: CentralEmployee[] | null = null;
let inflight: Promise<void> | null = null;
let channel: ReturnType<typeof supabase.channel> | null = null;
const listeners = new Set<(rows: CentralEmployee[]) => void>();

const emit = () => listeners.forEach((l) => l(cache ?? []));

async function fetchAll() {
  const { data } = await supabase.from("employees").select("*").order("full_name");
  cache = (data as any) ?? [];
  emit();
}

function ensureLoaded(force = false) {
  if (force) {
    inflight = fetchAll().finally(() => { inflight = null; });
    return inflight;
  }
  if (cache) { emit(); return Promise.resolve(); }
  if (!inflight) inflight = fetchAll().finally(() => { inflight = null; });
  return inflight;
}

function ensureChannel() {
  if (channel) return;
  channel = supabase
    .channel("central-employees")
    .on("postgres_changes", { event: "*", schema: "public", table: "employees" }, () => { ensureLoaded(true); })
    .subscribe();
}

/** Force a refresh (call right after an HR insert/update/delete). */
export const refreshEmployees = () => ensureLoaded(true);

export function useEmployees(opts?: { activeOnly?: boolean }) {
  const activeOnly = opts?.activeOnly ?? false;
  const [rows, setRows] = useState<CentralEmployee[]>(cache ?? []);
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    const listener = (r: CentralEmployee[]) => { setRows(r); setLoading(false); };
    listeners.add(listener);
    ensureChannel();
    ensureLoaded().then(() => setLoading(false));
    return () => { listeners.delete(listener); };
  }, []);

  const employees = activeOnly
    ? rows.filter((e) => (e.status ?? "active") === "active")
    : rows;

  return { employees, allEmployees: rows, loading, refresh: refreshEmployees };
}
