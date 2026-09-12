import { supabase } from "@/integrations/supabase/client";

export type StageGroup = {
  id: string;
  name: string;
  group_order: number;
};

export type StageGroupItem = {
  id: string;
  group_id: string;
  name: string;
  item_order: number;
  norm_days: number;
  qc_required: boolean;
};

/** All stage groups, ordered. */
export async function fetchStageGroups(): Promise<StageGroup[]> {
  const { data, error } = await supabase
    .from("stage_groups")
    .select("id, name, group_order")
    .order("group_order")
    .order("name");
  if (error) throw error;
  return (data ?? []).map((g: any) => ({ ...g, group_order: Number(g.group_order) || 0 }));
}

/** Catalog of child stages, ordered inside each group. */
export async function fetchStageGroupItems(): Promise<StageGroupItem[]> {
  const { data, error } = await supabase
    .from("stage_group_items")
    .select("id, group_id, name, item_order, norm_days, qc_required")
    .order("item_order")
    .order("name");
  if (error) throw error;
  return (data ?? []).map((i: any) => ({
    ...i,
    item_order: Number(i.item_order) || 1,
    norm_days: Number(i.norm_days) || 1,
    qc_required: !!i.qc_required,
  }));
}

export async function fetchGroupsWithItems() {
  const [groups, items] = await Promise.all([fetchStageGroups(), fetchStageGroupItems()]);
  return groups.map((g) => ({ ...g, items: items.filter((i) => i.group_id === g.id) }));
}

export const UNGROUPED_KEY = "__ungrouped__";

/** Group any list of stage-like rows (must carry group_id) by their parent group. */
export function groupStages<T extends { group_id?: string | null; stage_order?: number; group_order?: number | null }>(
  stages: T[],
  groups: StageGroup[],
) {
  const byId = new Map(groups.map((g) => [g.id, g]));
  const buckets = new Map<string, { key: string; name: string; order: number; items: T[] }>();
  for (const s of stages) {
    const g = s.group_id ? byId.get(s.group_id) : undefined;
    const key = g?.id ?? UNGROUPED_KEY;
    if (!buckets.has(key)) {
      buckets.set(key, { key, name: g?.name ?? "Guruhsiz", order: g?.group_order ?? 999, items: [] });
    }
    buckets.get(key)!.items.push(s);
  }
  const list = [...buckets.values()];
  list.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  for (const b of list) {
    b.items.sort(
      (x, y) => (Number(x.group_order ?? x.stage_order ?? 0) - Number(y.group_order ?? y.stage_order ?? 0)),
    );
  }
  return list;
}

/** Find the best matching group id for a free-typed stage name (same keywords as the DB backfill). */
export function guessGroupId(name: string, groups: StageGroup[]): string | null {
  const n = (name || "").toLowerCase();
  const rules: [string[], string][] = [
    [["chizma"], "chizma"],
    [["lazer"], "lazer"],
    [["valsofka"], "valsofka"],
    [["gip"], "gip"],
    [["svarka"], "svarka"],
    [["malyarka"], "malyarka"],
    [["kraska", "bo'yoq", "boyoq", "grunt", "pokraska"], "bo'yoq"],
    [["ispitaniya", "germetik", "test"], "ispitaniya"],
    [["elektrika", "chiroq", "kamera", "migalka", "bzu", "zzu"], "elektrika"],
    [["zagatov"], "zagatovka"],
    [["zborka", "montaj", "ornatish", "o'rnatish", "ustanovka", "obshifka", "yopishtirish"], "zborka"],
    [["chistka", "tozalash", "upakovka"], "tozalash va upakovka"],
  ];
  for (const [keys, groupName] of rules) {
    if (keys.some((k) => n.includes(k))) {
      const g = groups.find((x) => x.name.toLowerCase() === groupName);
      if (g) return g.id;
    }
  }
  return groups.find((x) => x.name.toLowerCase() === "boshqa")?.id ?? null;
}
