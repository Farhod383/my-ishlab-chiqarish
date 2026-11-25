// Kunlik topshiriqlar ↔ zakaz bosqichlari avtomatikasi.
// 1) Nachalnik bosqichni boshlaganda: tanlangan ishchilarga shu zakaz bo'yicha kunlik topshiriq avtomatik ochiladi
//    (ishchida shu zakaz bo'yicha ochiq topshiriq bo'lsa — o'sha qoladi; boshqa zakazda ochiq topshirig'i bo'lsa — tegilmaydi, ogohlantiriladi).
// 2) OTK bosqichni tasdiqlaganda (yoki OTK talab qilinmaydigan bosqich tugaganda): shu ishchilarning shu zakaz bo'yicha
//    ochiq topshiriqlari 100% bilan avtomatik yopiladi.
import { supabase } from "@/integrations/supabase/client";
import { parseWorkerNames } from "@/components/MultiEmployeeSelect";
import { isDailyTaskEligible } from "@/lib/dailyTaskEligibility";

const db = supabase as any;

export const nameKey = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().replace(/[’‘ʻʼ`´]/g, "'").replace(/\s+/g, " ").trim();

type Emp = { id: string; full_name: string; status?: string | null; department?: string | null; position?: string | null };
type OpenTask = { id: string; employee_id: string; order_id: string };

/** Ism bo'yicha xodim (faol, kunlik topshiriqqa mos), alias bo'lsa asosiy yozuv. */
export function resolveWorkers(names: string[], employees: Emp[], aliases: Map<string, string>) {
  const byName = new Map<string, Emp[]>();
  for (const e of employees) {
    if ((e.status ?? "active") !== "active") continue;
    const k = nameKey(e.full_name);
    byName.set(k, [...(byName.get(k) ?? []), e]);
  }
  const found: { name: string; id: string }[] = [];
  const missing: string[] = [];
  for (const n of names) {
    const list = (byName.get(nameKey(n)) ?? []).filter((e) => isDailyTaskEligible(e));
    const ids = [...new Set(list.map((e) => aliases.get(e.id) ?? e.id))];
    if (ids.length === 1) found.push({ name: n, id: ids[0] });
    else missing.push(n);
  }
  return { found, missing };
}

/** Boshlashda nima qilinadi (sof funksiya — testlanadi). */
export function planStart(orderId: string, workers: { name: string; id: string }[], open: OpenTask[]) {
  const create: { name: string; id: string }[] = [];
  const kept: string[] = [];
  const busy: string[] = [];
  for (const w of workers) {
    const t = open.find((x) => x.employee_id === w.id);
    if (!t) create.push(w);
    else if (t.order_id === orderId) kept.push(w.name);
    else busy.push(w.name);
  }
  return { create, kept, busy };
}

async function loadPeople(names: string[]) {
  const [{ data: emps }, { data: al }] = await Promise.all([
    db.from("employees").select("id, full_name, status, department, position").in("full_name", names),
    db.from("daily_task_employee_aliases").select("alias_id, canonical_id"),
  ]);
  const aliases = new Map<string, string>(((al ?? []) as any[]).map((r) => [r.alias_id, r.canonical_id]));
  return resolveWorkers(names, (emps ?? []) as Emp[], aliases);
}

export type AutoResult = { created: string[]; kept: string[]; busy: string[]; missing: string[]; closed: string[] };

/** Bosqich boshlandi → kunlik topshiriq ochiladi. Xato bo'lsa bosqichni to'xtatmaydi. */
export async function autoTasksOnStageStart(p: { orderId: string; stageName: string; workerNames: string[]; actorName?: string | null }): Promise<AutoResult> {
  const res: AutoResult = { created: [], kept: [], busy: [], missing: [], closed: [] };
  const names = p.workerNames.filter(Boolean);
  if (!names.length) return res;
  const { found, missing } = await loadPeople(names);
  res.missing = missing;
  if (!found.length) return res;
  const { data: open } = await db.from("daily_tasks").select("id, employee_id, order_id")
    .eq("status", "in_progress").in("employee_id", found.map((w) => w.id));
  const plan = planStart(p.orderId, found, (open ?? []) as OpenTask[]);
  res.kept = plan.kept; res.busy = plan.busy;
  for (const w of plan.create) {
    const { error } = await db.from("daily_tasks").insert({
      employee_id: w.id, order_id: p.orderId, task_title: p.stageName,
      description: "Avtomatik: nachalnik bosqichni boshladi", assigned_by_name: p.actorName ?? null, progress: 0,
    });
    if (error) res.busy.push(w.name); else res.created.push(w.name);
  }
  return res;
}

/** OTK tasdiqladi (yoki OTK kerak bo'lmagan bosqich tugadi) → shu zakaz bo'yicha ochiq topshiriqlar yopiladi. */
export async function autoTasksOnStageDone(p: { orderId: string; stageId: string }): Promise<AutoResult> {
  const res: AutoResult = { created: [], kept: [], busy: [], missing: [], closed: [] };
  const { data: st } = await db.from("order_stages").select("worker_name").eq("id", p.stageId).maybeSingle();
  const names = parseWorkerNames(st?.worker_name);
  if (!names.length) return res;
  const { found, missing } = await loadPeople(names);
  res.missing = missing;
  if (!found.length) return res;
  const { data, error } = await db.from("daily_tasks").update({ status: "closed", progress: 100 })
    .eq("order_id", p.orderId).eq("status", "in_progress").in("employee_id", found.map((w) => w.id))
    .select("employee_id");
  if (error) throw error;
  const closedIds = new Set(((data ?? []) as any[]).map((r) => r.employee_id));
  res.closed = found.filter((w) => closedIds.has(w.id)).map((w) => w.name);
  return res;
}

/** Natijani bitta qisqa xabarga aylantiradi (bo'sh bo'lsa null). */
export function describeAuto(r: AutoResult): string | null {
  const parts: string[] = [];
  if (r.created.length) parts.push(`Kunlik topshiriq ochildi: ${r.created.join(", ")}`);
  if (r.closed.length) parts.push(`Kunlik topshiriq yopildi: ${r.closed.join(", ")}`);
  if (r.busy.length) parts.push(`Boshqa zakazda ochiq topshirig'i bor: ${r.busy.join(", ")}`);
  if (r.missing.length) parts.push(`Xodimlar ro'yxatida topilmadi: ${r.missing.join(", ")}`);
  return parts.length ? parts.join(" · ") : null;
}
