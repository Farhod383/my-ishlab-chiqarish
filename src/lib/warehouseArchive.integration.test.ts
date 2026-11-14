import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const sessionPath = process.env.WAREHOUSE_DELETE_SESSION;
describe.skipIf(!sessionPath)("Sklad catalog editing and archive", () => {
  const db = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  let id = "", unused = "", movement = "", originalCode = "", replacement = "";
  const read = async () => { const r = await db.from("products").select("*").eq("id", id).single(); if (r.error) throw r.error; return r.data; };
  beforeAll(async () => {
    if (!sessionPath) throw new Error("Session required");
    const s = await db.auth.setSession(JSON.parse(readFileSync(sessionPath, "utf8")).session); if (s.error) throw s.error;
    const p = await db.from("products").insert([{ name: `TEST Archive proof ${crypto.randomUUID()}`, unit: "dona", stock_qty: 0, last_price: 7 }, { name: `TEST Unused proof ${crypto.randomUUID()}`, unit: "dona", stock_qty: 0, last_price: 0 }]).select("id,barcode"); if (p.error) throw p.error;
    id = p.data[0].id; originalCode = p.data[0].barcode ?? ""; unused = p.data[1].id;
    const m = await db.from("stock_movements").insert({ product_id: id, direction: "in", quantity: 10, unit_price: 7 }).select("id").single(); if (m.error) throw m.error; movement = m.data.id;
  });
  afterAll(async () => {
    if (!movement) return;
    const r = await db.rpc("delete_warehouse_record", { _entity: "movement", _ids: [movement], _expected_qty: 10 });
    if (r.error) throw r.error;
    expect((await read()).stock_qty).toBe(0);
  });
  it("warehouse saves name/category/dimensions without changing stock or price", async () => {
    const r = await db.rpc("save_product_inventory", { _key: crypto.randomUUID(), _product_id: id, _quantity: 10, _expected_stock: 10, _changes: { name: "TEST Archive edited " + id, category: "Sinov", thickness_mm: 2 }, _comment: null });
    expect(r.error).toBeNull(); const p = await read(); expect(p.name).toBe("TEST Archive edited " + id); expect(p.category).toBe("Sinov"); expect(p.thickness_mm).toBe(2); expect(p.stock_qty).toBe(10); expect(p.last_price).toBe(7); expect(p.barcode).toBe(originalCode);
  });
  it("warehouse can save MXIK with leading zeros", async () => { const r = await db.rpc("set_product_mxik", { _product_id: id, _code: "00012345678901234", _expected_code: null }); expect(r.error).toBeNull(); expect((await read()).mxik_code).toBe("00012345678901234"); });
  it("explicit barcode replacement retains old scan alias", async () => { replacement = "ARCHIVE" + crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase(); const r = await db.rpc("set_product_barcode", { _product_id: id, _code: replacement, _expected_code: originalCode }); expect(r.error).toBeNull(); expect((await read()).barcode).toBe(replacement); const old = await db.rpc("scan_catalog", { _code: originalCode }); expect(old.error).toBeNull(); expect((old.data as { id: string }[]).some(p => p.id === id)).toBe(true); });
  it("unit change with history is rejected without changing balances", async () => { const r = await db.rpc("save_product_inventory", { _key: crypto.randomUUID(), _product_id: id, _quantity: 10, _expected_stock: 10, _changes: { unit: "kg" } }); expect(r.error).not.toBeNull(); expect((await read()).unit).toBe("dona"); expect((await read()).stock_qty).toBe(10); });
  it("unused product is physically deleted by warehouse", async () => { const r = await db.rpc("archive_or_delete_warehouse_products", { _ids: [unused], _expected_qty: 0 }); expect(r.error).toBeNull(); const p = await db.from("products").select("id").eq("id", unused); expect(p.data).toHaveLength(0); });
  it("used product is archived while ID, stock, price, codes and history survive", async () => { const before = await read(); const r = await db.rpc("archive_or_delete_warehouse_products", { _ids: [id], _expected_qty: 10 }); expect(r.error).toBeNull(); expect(r.data).toMatchObject({ archived: true, stock: 10 }); const after = await read(); expect(after.archived_at).toBeTruthy(); for (const key of ["id", "stock_qty", "last_price", "mxik_code", "barcode", "product_type_id"] as const) expect(after[key]).toBe(before[key]); const m = await db.from("stock_movements").select("product_id,quantity").eq("id", movement).single(); expect(m.data).toMatchObject({ product_id: id, quantity: 10 }); });
  it("archived product cannot be scanned, received or issued through API", async () => { for (const code of [originalCode, replacement]) { const r = await db.rpc("scan_catalog", { _code: code }); expect(r.error).toBeNull(); expect(r.data).toEqual([]); } for (const direction of ["in", "out"] as const) { const r = await db.from("stock_movements").insert({ product_id: id, direction, quantity: 1 }); expect(r.error).not.toBeNull(); } expect((await read()).stock_qty).toBe(10); });
  it("archive audit records actor/time and direct archive bypass is denied", async () => { const r = await db.from("entity_audit").select("actor_id,created_at,old_value,new_value").eq("entity_id", id).eq("action", "warehouse_archive"); expect(r.error).toBeNull(); expect(r.data).toHaveLength(1); expect(r.data?.[0].actor_id).toBeTruthy(); expect(r.data?.[0].created_at).toBeTruthy(); const bypass = await db.from("products").update({ archived_at: null, archived_by: null }).eq("id", id); expect(bypass.error).not.toBeNull(); });
  it("anonymous callers cannot edit or archive", async () => { const anon = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } }); expect((await anon.rpc("archive_or_delete_warehouse_products", { _ids: [id], _expected_qty: 10 })).error).not.toBeNull(); expect((await anon.rpc("save_product_inventory", { _key: crypto.randomUUID(), _product_id: id, _quantity: 10, _expected_stock: 10, _changes: { name: "Forbidden" } })).error).not.toBeNull(); });
});