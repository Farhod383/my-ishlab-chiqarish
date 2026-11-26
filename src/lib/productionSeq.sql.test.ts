// 0097: zakazlarni ishlab chiqarishga qo'yish tartibi (orders.production_seq) — PGlite'da.
import { describe, expect, it, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

let db: PGlite;
const MARKETING = "00000000-0000-0000-0000-000000000001";
const MANAGER = "00000000-0000-0000-0000-000000000002";
const id = async (n: string) => (await db.query<{ id: string }>(`select id from orders where n=$1`, [n])).rows[0].id;
const set = async (n: string, s: number | null) => (await db.query<{ r: number | null }>(`select set_production_seq($1,$2) r`, [await id(n), s])).rows[0].r;
const show = async () => (await db.query<{ s: string | null }>(`select string_agg(n||':'||production_seq, ' ' order by production_seq) s from orders where production_seq is not null`)).rows[0].s;

describe("ishlab chiqarish tartibi (0097)", () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`CREATE SCHEMA auth; CREATE TABLE cur(uid uuid); INSERT INTO cur VALUES ('${MARKETING}');
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT uid FROM public.cur $$;
      CREATE TABLE user_roles(user_id uuid, role text);
      INSERT INTO user_roles VALUES ('${MARKETING}','marketing'),('${MANAGER}','manager');
      CREATE FUNCTION has_role(u uuid, r text) RETURNS boolean LANGUAGE sql AS $$ SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id=u AND role=r) $$;
      CREATE TABLE orders(id uuid primary key default gen_random_uuid(), n text, status text default 'pending');
      CREATE ROLE anon; CREATE ROLE authenticated;
      INSERT INTO orders(n) SELECT 'Z'||g FROM generate_series(1,5) g;
      GRANT ALL ON orders, cur, user_roles TO authenticated; GRANT USAGE ON SCHEMA auth TO authenticated;`);
    await db.exec(readFileSync(resolve(__dirname, "../../drizzle/migrations/0097_order_production_seq.sql"), "utf8"));
  });

  it("band raqam — qolganlari suriladi, bo'shliq qolmaydi", async () => {
    expect(await set("Z1", 1)).toBe(1);
    expect(await set("Z2", 1)).toBe(1);
    expect(await set("Z3", 9)).toBe(3);
    expect(await show()).toBe("Z2:1 Z1:2 Z3:3");
    await set("Z4", 2);
    expect(await show()).toBe("Z2:1 Z4:2 Z1:3 Z3:4");
    await set("Z2", 4);
    expect(await show()).toBe("Z4:1 Z1:2 Z3:3 Z2:4");
  });

  it("tugagan zakaz tartibdan chiqadi, olib tashlash ishlaydi", async () => {
    await db.exec(`update orders set status='completed' where n='Z1'`);
    expect(await show()).toBe("Z4:1 Z3:2 Z2:3");
    expect(await set("Z3", null)).toBeNull();
    expect(await show()).toBe("Z4:1 Z2:2");
    await expect(set("Z1", 1)).rejects.toThrow(/Tugagan/);
  });

  it("faqat marketing/admin; to'g'ridan-to'g'ri UPDATE taqiqlangan", async () => {
    await db.exec(`update cur set uid='${MANAGER}'`);
    await expect(set("Z5", 1)).rejects.toThrow(/marketing yoki admin/);
    await db.exec(`SET ROLE authenticated`);
    await expect(db.exec(`update orders set production_seq=7 where n='Z5'`)).rejects.toThrow(/Tartib/);
    await db.exec(`update orders set status='cancelled' where n='Z4'`);
    await db.exec(`RESET ROLE`);
    expect(await show()).toBe("Z2:1");
  });
});
