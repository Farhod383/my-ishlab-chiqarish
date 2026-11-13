import { beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const sessionPath = process.env.WAREHOUSE_DELETE_SESSION;
describe.skipIf(!sessionPath)("warehouse deletion permissions and balance", () => {
  const db = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  let id = "";
  let movement = "";
  beforeAll(async () => {
    if (!sessionPath) throw new Error("Session required");
    const r = await db.auth.setSession(JSON.parse(readFileSync(sessionPath, "utf8")).session);
    if (r.error) throw r.error;
    const p = await db.from("products").insert({ name: `TEST Delete check ${crypto.randomUUID()}`, unit: "dona", stock_qty: 0, last_price: 0 }).select("id").single();
    if (p.error) throw p.error;
    id = p.data.id;
    const m = await db.from("stock_movements").insert({ product_id: id, direction: "in", quantity: 10 }).select("id").single();
    if (m.error) throw m.error;
    movement = m.data.id;
  });
  const remove = (entity: string, target: string, qty: number) => db.rpc("delete_warehouse_record", { _entity: entity, _ids: [target], _expected_qty: qty });
  const stock = async () => { const r = await db.from("products").select("stock_qty").eq("id", id).single(); if (r.error) throw r.error; return Number(r.data.stock_qty); };
  it("warehouse cannot delete a product with real movement links or nonzero stock", async () => { const r = await remove("product", id, 10); expect(r.error).not.toBeNull(); expect(await stock()).toBe(10); });
  it("direct API deletion cannot bypass protected action", async () => { const r = await db.from("stock_movements").delete().eq("id", movement); expect(r.error).not.toBeNull(); expect(await stock()).toBe(10); });
  it("stale quantity cannot change stock", async () => { const r = await remove("movement", movement, 9); expect(r.error).not.toBeNull(); expect(await stock()).toBe(10); });
  it("warehouse removes an intake and reverses 10 to 0 exactly once", async () => { const r = await remove("movement", movement, 10); expect(r.error).toBeNull(); expect(await stock()).toBe(0); const again = await remove("movement", movement, 10); expect(again.error).toBeNull(); expect(again.data).toMatchObject({ replayed: true }); expect(await stock()).toBe(0); });
  it("zero-stock unlinked product is actually deleted with an actor audit", async () => { const r = await remove("product", id, 0); expect(r.error).toBeNull(); const p = await db.from("products").select("id").eq("id", id); expect(p.data).toHaveLength(0); const a = await db.from("warehouse_deletions").select("actor_id,created_at").eq("entity", "product").eq("entity_id", id).single(); expect(a.error).toBeNull(); expect(a.data?.actor_id).toBeTruthy(); expect(a.data?.created_at).toBeTruthy(); });
  it("anonymous callers cannot delete products", async () => { const anon = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } }); const r = await anon.rpc("delete_warehouse_record", { _entity: "product", _ids: [id], _expected_qty: 0 }); expect(r.error).not.toBeNull(); });
});