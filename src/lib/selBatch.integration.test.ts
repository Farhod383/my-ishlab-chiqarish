import { beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const sessionPath = process.env.SEL_BATCH_SESSION;
describe.skipIf(!sessionPath)("SEL November 14 batch", () => {
  const db = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  let orders: any[] = [];
  let sample: any;
  let activeRange: any[] = [];
  beforeAll(async () => {
    if (!sessionPath) throw new Error("Session required");
    const auth = await db.auth.setSession(JSON.parse(readFileSync(sessionPath, "utf8")).session);
    if (auth.error) throw auth.error;
    const result = await db.from("orders").select("*,order_stages(*)").gte("order_number", "SEL0101").lte("order_number", "SEL0120").order("order_number");
    if (result.error) throw result.error;
    orders = result.data ?? [];
    const source = await db.from("orders").select("*,order_stages(*)").eq("order_number", "SEL0092").single();
    if (source.error) throw source.error;
    sample = source.data;
    const active = await db.from("orders").select("*,order_stages(*)").gte("order_number", "SEL0093").lte("order_number", "SEL0120").order("order_number");
    if (active.error) throw active.error;
    activeRange = active.data ?? [];
  });
  it("contains exactly SEL0101 through SEL0120 without duplicate numbers", () => {
    expect(orders.map(o => o.order_number)).toEqual(Array.from({ length: 20 }, (_, i) => `SEL${String(i + 101).padStart(4, "0")}`));
    expect(new Set(orders.map(o => o.id)).size).toBe(20);
  });
  it("contains exactly the requested 28 existing orders SEL0093 through SEL0120", () => {
    expect(activeRange.map(o => o.order_number)).toEqual(Array.from({ length: 28 }, (_, i) => `SEL${String(i + 93).padStart(4, "0")}`));
    expect(new Set(activeRange.map(o => o.id)).size).toBe(28);
    for (const o of activeRange) expect(o.status).toBe("in_progress");
  });
  it("marks exactly SEL0001 through SEL0092 and all their stages completed", async () => {
    const result = await db.from("orders").select("order_number,status,order_stages(status)").gte("order_number", "SEL0000").lte("order_number", "SEL0092").order("order_number");
    if (result.error) throw result.error;
    expect(result.data?.map(o => o.order_number)).toEqual(Array.from({ length: 92 }, (_, i) => `SEL${String(i + 1).padStart(4, "0")}`));
    for (const o of result.data ?? []) {
      expect(o.status).toBe("completed");
      expect(o.order_stages.length).toBeGreaterThan(0);
      for (const stage of o.order_stages) expect(stage.status).toBe("completed");
    }
  });
  it("administrative completion changes no OTK, worker, or historical date fields", async () => {
    const result = await db.from("entity_audit").select("entity,old_value,new_value").eq("action", "sel_admin_status_correction_20261114");
    if (result.error) throw result.error;
    const stageAudits = (result.data ?? []).filter(a => a.entity === "order_stages");
    expect(stageAudits).toHaveLength(252);
    for (const a of stageAudits) {
      const oldRow = a.old_value as Record<string, unknown>;
      const newRow = a.new_value as Record<string, unknown>;
      expect(newRow.status).toBe("completed");
      expect(oldRow.status).not.toBe("completed");
      const { status: oldStatus, ...oldMetadata } = oldRow;
      const { status: newStatus, ...newMetadata } = newRow;
      expect(newMetadata).toEqual(oldMetadata);
    }
    const orderAudits = (result.data ?? []).filter(a => a.entity === "orders");
    expect(orderAudits).toHaveLength(12);
    for (const a of orderAudits) {
      expect(a.old_value).toMatchObject({ status: "in_progress" });
      expect(a.new_value).toMatchObject({ status: "completed" });
    }
  });
  it("has one started, unfinished drawing without current OTK approval on all 28 orders", () => {
    expect(activeRange).toHaveLength(28);
    for (const o of activeRange) {
      const drawings = o.order_stages.filter((s: any) => s.name === "Chizma chizish");
      expect(drawings).toHaveLength(1);
      expect(drawings[0]).toMatchObject({ status: "in_progress", finished_at: null, qc_passed: null, otk_checked_at: null, worker_name: "Bakirov Xudoyorxon" });
      expect(drawings[0].started_at).toBeTruthy();
    }
  });
  it("retains the previous completion and OTK history when reopening eight drawings", async () => {
    const result = await db.from("entity_audit").select("entity_id,old_value,new_value").eq("action", "sel_drawing_reopened_20261114");
    if (result.error) throw result.error;
    expect(result.data).toHaveLength(8);
    for (const a of result.data ?? []) {
      expect(a.old_value).toMatchObject({ status: "completed", qc_passed: true });
      expect(a.new_value).toMatchObject({ status: "in_progress", qc_passed: null, finished_at: null });
    }
  });
  it("all 20 orders are in progress with the sample product and client", () => {
    expect(orders).toHaveLength(20);
    for (const o of orders) {
      expect(o.status).toBe("in_progress");
      expect(o.product_name).toBe(sample.product_name);
      expect(o.client_id).toBe(sample.client_id);
      expect(o.quantity).toBe(sample.quantity);
    }
  });
  it("starts drawing on every order without recording completion or OTK approval", () => {
    expect(orders).toHaveLength(20);
    for (const o of orders) {
      const drawing = o.order_stages.find((s: any) => s.stage_order === 1);
      expect(drawing).toMatchObject({ name: "Chizma chizish", status: "in_progress", worker_name: "Bakirov Xudoyorxon", finished_at: null, qc_passed: null, otk_checked_at: null });
      expect(drawing.started_at).toBeTruthy();
    }
  });
  it("creates 10 independent pending stages with sample assignments and no copied history", () => {
    const source = [...sample.order_stages].sort((a, b) => a.stage_order - b.stage_order);
    expect(source).toHaveLength(10);
    const stageIds: string[] = [];
    for (const o of orders) {
      const stages = o.order_stages.filter((s: any) => s.stage_order > 1).sort((a: any, b: any) => a.stage_order - b.stage_order);
      expect(stages).toHaveLength(10);
      stages.forEach((s: any, i: number) => {
        expect(s).toMatchObject({ name: source[i].name, worker_name: source[i].worker_name, group_id: source[i].group_id, norm_days: source[i].norm_days, qc_required: source[i].qc_required, status: "pending", started_at: null, finished_at: null, qc_passed: null, otk_checked_at: null, otk_comment: null });
        expect(s.id).not.toBe(source[i].id);
        stageIds.push(s.id);
      });
    }
    expect(new Set(stageIds).size).toBe(200);
  });
});