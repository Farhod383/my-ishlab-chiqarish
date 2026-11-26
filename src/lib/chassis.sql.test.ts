// «Shassi» moduli: 0090 migratsiyasini haqiqiy Postgres (PGlite) ichida tekshiradi.
// Supabase'ning kerakli qismi (auth.uid, rollar, clients/orders/order_stages, entity_audit) soddalashtirib yaratiladi.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

const STUB = `
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
CREATE TYPE public.app_role AS ENUM ('admin','marketing','manager','worker','warehouse','supply','otk','hr','cashier','engineer','chief_accountant','accountant');
CREATE TYPE public.order_status AS ENUM ('pending','in_progress','completed','delayed','cancelled');
CREATE TABLE public.user_roles (user_id uuid, role public.app_role);
CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean LANGUAGE sql STABLE AS
  $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;
CREATE TABLE public.clients (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL);
CREATE TABLE public.orders (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_number text NOT NULL, product_name text NOT NULL DEFAULT 'x',
  status public.order_status NOT NULL DEFAULT 'in_progress', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.order_stages (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid, qc_required boolean NOT NULL DEFAULT false, qc_passed boolean);
CREATE TABLE public.entity_audit (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entity text, entity_id uuid, action text, old_value jsonb,
  new_value jsonb, actor_id uuid, actor_name text, role text, created_at timestamptz DEFAULT now());
`;
const MIGRATION = ["0090_chassis_module.sql", "0094_chassis_receive_accountant.sql"]
  .map((f) => readFileSync(resolve(__dirname, "../../drizzle/migrations/" + f), "utf8")).join("\n");

const U = {
  admin: "00000000-0000-0000-0000-00000000000a",
  warehouse: "00000000-0000-0000-0000-000000000001",
  engineer: "00000000-0000-0000-0000-000000000002",
  otk: "00000000-0000-0000-0000-000000000003",
  marketing: "00000000-0000-0000-0000-000000000004",
  accountant: "00000000-0000-0000-0000-000000000005",
  worker: "00000000-0000-0000-0000-000000000006",
};
const VIN = (n: number) => `LFWADRJF5R1A${String(n).padStart(5, "0")}`;

let db: PGlite;
let client: string;
let line: string;

async function as<T = Record<string, unknown>>(who: keyof typeof U, sql: string, params: unknown[] = []): Promise<T[]> {
  await db.query(`SELECT set_config('test.uid', $1, false)`, [U[who]]);
  return (await db.query<T>(sql, params)).rows;
}
async function one<T = Record<string, unknown>>(who: keyof typeof U, sql: string, params: unknown[] = []) {
  return (await as<T>(who, sql, params))[0];
}
async function order(num: string, qcPassed: boolean | null = true) {
  const o = (await db.query<{ id: string }>(`INSERT INTO orders(order_number) VALUES ($1) RETURNING id`, [num])).rows[0].id;
  await db.query(`INSERT INTO order_stages(order_id, qc_required, qc_passed) VALUES ($1, true, $2), ($1, false, NULL)`, [o, qcPassed]);
  return o;
}
async function readyChassis(n: number, lineId = line) {
  const id = await one<{ id: string }>("accountant",
    `SELECT chassis_receive($1, 'ENG-1', 100, '{}'::jsonb, NULL, ARRAY['p/1.jpg'], 'Ishonchnoma 1', NULL, $2) AS id`, [VIN(n), client]);
  const o = await order(`SEL${String(1000 + n)}`);
  await as("engineer", `SELECT chassis_to_production($1, $2, $3)`, [id.id, lineId, o]);
  await as("otk", `SELECT chassis_mark_ready($1, false, NULL)`, [id.id]);
  return id.id;
}

describe("Shassi moduli (SQL)", () => {
  beforeEach(async () => {
    db = new PGlite();
    await db.exec(STUB);
    await db.exec(MIGRATION);
    for (const [role, id] of Object.entries(U)) if (role !== "worker") await db.query(`INSERT INTO user_roles VALUES ($1, $2)`, [id, role]);
    await db.query(`INSERT INTO user_roles VALUES ($1, 'worker')`, [U.worker]);
    client = (await db.query<{ id: string }>(`INSERT INTO clients(name) VALUES ('Obod Shahar MChJ') RETURNING id`)).rows[0].id;
    const spec = (await db.query<{ id: string }>(`INSERT INTO chassis_specs(client_id, contract_no, spec_no, spec_date) VALUES ($1, '14/26', '2', '2026-11-01') RETURNING id`, [client])).rows[0].id;
    line = (await db.query<{ id: string }>(
      `INSERT INTO chassis_spec_lines(spec_id, body_type_id, qty, price_gross) SELECT $1, id, 2, 186480000 FROM body_types WHERE code = 'selno' RETURNING id`, [spec])).rows[0].id;
  }, 60_000);

  it("to'liq yo'l: qabul → akt → ESF → yopildi, tarix yoziladi", async () => {
    const c = await readyChassis(1);
    const act = await one<{ id: string }>("marketing", `SELECT chassis_create_act(ARRAY[$1]::uuid[], '2026-11-25') AS id`, [c]);
    const a = await one<{ act_no: string; total_vat: string; status: string }>("admin", `SELECT act_no, total_vat, status FROM chassis_acts WHERE id = $1`, [act.id]);
    expect(a.act_no).toBe("A-2026-001");
    const esf = await one<{ e: Record<string, unknown> }>("accountant", `SELECT chassis_esf_line($1) AS e`, [act.id]);
    expect(esf.e).toMatchObject({ qty: 1, vat_rate: 12, origin: "Собственное производство" });
    expect(String(esf.e.name)).toContain(`акт № A-2026-001 от 25.11.2026) VIN: ${VIN(1)}`);
    expect(Number(esf.e.price_net)).toBe(166500000);
    expect(Number(a.total_vat)).toBe(19980000);
    await as("warehouse", `SELECT chassis_ship_act($1, now(), 'Aliyev A.', '№ 112')`, [act.id]);
    await as("accountant", `SELECT chassis_register_esf($1, 'ESF-1', '2026-11-26', 186480000.3)`, [act.id]);
    await as("accountant", `SELECT chassis_close_act($1)`, [act.id]);
    const ch = await one<{ status: string; intake_act_no: string }>("admin", `SELECT status, intake_act_no FROM chassis WHERE id = $1`, [c]);
    expect(ch.status).toBe("closed");
    expect(ch.intake_act_no).toMatch(/^P-\d{8}-0001$/);
    const ev = await as<{ to_status: string }>("admin", `SELECT to_status FROM chassis_events WHERE chassis_id = $1 ORDER BY created_at`, [c]);
    expect(ev.map((e) => e.to_status)).toEqual(["received", "in_production", "ready", "in_act", "shipped", "esf_issued", "closed"]);
  });

  it("dubl VIN: kutilganlar ro'yxatida va qabulda rad etiladi, O/I tuzatiladi", async () => {
    const r = await one<{ r: { added: number; rejected: { vin: string; reason: string }[] } }>("accountant",
      `SELECT chassis_expect(ARRAY[$1, $2, 'XYZ'], $3, NULL) AS r`, [VIN(2).toLowerCase().replace("0", "o"), VIN(2), client]);
    expect(r.r.added).toBe(1);
    expect(r.r.rejected.map((x) => x.reason)).toEqual(["Ro'yxatda takrorlangan", expect.stringContaining("VIN noto'g'ri")]);
    await readyChassis(2);
    await expect(as("accountant", `SELECT chassis_receive($1, NULL, 1, '{}', NULL, ARRAY['p.jpg'], 'x', NULL, $2)`, [VIN(2), client]))
      .rejects.toThrow(/VIN allaqachon reestrda: tayyor/);
  });

  it("rasmsiz qabul va ruxsatsiz rol rad etiladi", async () => {
    await expect(as("accountant", `SELECT chassis_receive($1, NULL, 1, '{}', NULL, ARRAY[]::text[], 'x', NULL, $2)`, [VIN(3), client]))
      .rejects.toThrow(/Kamida 1 ta rasm/);
    await expect(as("worker", `SELECT chassis_receive($1, NULL, 1, '{}', NULL, ARRAY['p.jpg'], 'x', NULL, $2)`, [VIN(3), client]))
      .rejects.toThrow(/ruxsat yo'q/);
    // 0094: ombor endi qabul qilmaydi
    await expect(as("warehouse", `SELECT chassis_receive($1, NULL, 1, '{}', NULL, ARRAY['p.jpg'], 'x', NULL, $2)`, [VIN(3), client]))
      .rejects.toThrow(/ruxsat yo'q/);
    await expect(as("warehouse", `SELECT chassis_expect(ARRAY[$1], $2, NULL)`, [VIN(3), client])).rejects.toThrow(/ruxsat yo'q/);
  });

  it("OTK'dan o'tmagan zakaz bilan «tayyor» bo'lmaydi; prefiks mos kelmasa ishlab chiqarishga berilmaydi", async () => {
    const id = (await one<{ id: string }>("accountant", `SELECT chassis_receive($1, NULL, 1, '{}', NULL, ARRAY['p.jpg'], 'x', NULL, $2) AS id`, [VIN(4), client])).id;
    await expect(as("engineer", `SELECT chassis_to_production($1, $2, $3)`, [id, line, await order("KDM0004")]))
      .rejects.toThrow(/prefiksi/);
    await as("engineer", `SELECT chassis_to_production($1, $2, $3)`, [id, line, await order("SEL0004", false)]);
    await expect(as("otk", `SELECT chassis_mark_ready($1, true, NULL)`, [id])).rejects.toThrow(/OTK'dan o'tmagan/);
  });

  it("spetsifikatsiyadan oshib bo'lmaydi", async () => {
    const ids = [await readyChassis(5), await readyChassis(6), await readyChassis(7)];
    await expect(as("marketing", `SELECT chassis_create_act($1::uuid[], '2026-11-25')`, [ids])).rejects.toThrow(/Spetsifikatsiyadan oshib ketadi/);
    await as("marketing", `SELECT chassis_create_act($1::uuid[], '2026-11-25')`, [ids.slice(0, 2)]);
    await expect(as("marketing", `SELECT chassis_create_act($1::uuid[], '2026-11-25')`, [[ids[2]]])).rejects.toThrow(/shartnomada 2, aktlarda 2/);
  });

  it("noto'g'ri ESF summasi ikkala summa bilan rad etiladi", async () => {
    const act = (await one<{ id: string }>("marketing", `SELECT chassis_create_act(ARRAY[$1]::uuid[], '2026-11-25') AS id`, [await readyChassis(8)])).id;
    await as("warehouse", `SELECT chassis_ship_act($1, now(), 'Oluvchi', '№ 1')`, [act]);
    await expect(as("accountant", `SELECT chassis_register_esf($1, 'ESF-9', '2026-11-26', 186000000)`, [act]))
      .rejects.toThrow(/ESF 186000000 so'm, akt 186480000\.00 so'm/);
  });

  it("bitta VIN ikki amaldagi aktga kirmaydi; bekor qilinsa qayta kiradi", async () => {
    const c = await readyChassis(9);
    const act = (await one<{ id: string }>("marketing", `SELECT chassis_create_act(ARRAY[$1]::uuid[], '2026-11-25') AS id`, [c])).id;
    await db.query(`SELECT set_config('mcity.chassis_tx', '1', false)`);
    const other = (await db.query<{ id: string }>(`INSERT INTO chassis_acts(act_date, client_id, body_type_id, price_gross, qty, total_gross)
      SELECT '2026-11-25', $1, body_type_id, 1, 1, 1 FROM chassis_spec_lines WHERE id = $2 RETURNING id`, [client, line])).rows[0].id;
    await expect(db.query(`INSERT INTO chassis_act_items VALUES ($1, $2, $3, 1)`, [other, c, line])).rejects.toThrow(/allaqachon boshqa aktda/);
    await db.query(`SELECT set_config('mcity.chassis_tx', '', false)`);
    await expect(as("marketing", `SELECT chassis_create_act(ARRAY[$1]::uuid[], '2026-11-25')`, [c])).rejects.toThrow(/Tayyor bo'lmagan/);
    await as("marketing", `SELECT chassis_void_act($1, 'Xato narx')`, [act]);
    const again = (await one<{ id: string }>("marketing", `SELECT chassis_create_act(ARRAY[$1]::uuid[], '2026-11-25') AS id`, [c])).id;
    expect(again).not.toBe(act);
  });

  it("almashtirish: eski akt bekor, yangisi o'sha oluvchi bilan jo'natilgan", async () => {
    const c = await readyChassis(10);
    const act = (await one<{ id: string }>("marketing", `SELECT chassis_create_act(ARRAY[$1]::uuid[], '2026-11-25') AS id`, [c])).id;
    await as("warehouse", `SELECT chassis_ship_act($1, now(), 'Karimov B.', '№ 5')`, [act]);
    const nid = (await one<{ id: string }>("marketing", `SELECT chassis_replace_act($1, ARRAY[$2]::uuid[], 'Sana xato') AS id`, [act, c])).id;
    const rows = await as<{ id: string; status: string; recipient_name: string; replaces_act_id: string }>("admin",
      `SELECT id, status, recipient_name, replaces_act_id FROM chassis_acts ORDER BY created_at`);
    expect(rows.find((r) => r.id === act)?.status).toBe("void");
    expect(rows.find((r) => r.id === nid)).toMatchObject({ status: "shipped", recipient_name: "Karimov B.", replaces_act_id: act });
    expect((await one<{ status: string }>("admin", `SELECT status FROM chassis WHERE id = $1`, [c])).status).toBe("shipped");
  });

  it("holatni to'g'ridan-to'g'ri UPDATE qilish va tarixni o'zgartirish taqiqlangan", async () => {
    const c = await readyChassis(11);
    await expect(db.query(`UPDATE chassis SET status = 'closed' WHERE id = $1`, [c])).rejects.toThrow(/to'g'ridan-to'g'ri/);
    await expect(db.query(`INSERT INTO chassis(vin, client_id) VALUES ($1, $2)`, [VIN(12), client])).rejects.toThrow(/funksiyalari orqali/);
    await expect(db.query(`DELETE FROM chassis_events`)).rejects.toThrow(/tarixini/);
    await db.query(`UPDATE chassis SET defects = 'tirnalgan' WHERE id = $1`, [c]); // boshqa ustunlar (faqat egasi) o'zgarishi mumkin
  });

  it("«Diqqat talab qiladi» va qoldiq ko'rinishlari ishlaydi", async () => {
    await as("accountant", `SELECT chassis_expect(ARRAY[$1], $2, NULL)`, [VIN(13), client]);
    await db.exec(`ALTER TABLE chassis DISABLE TRIGGER chassis_status_guard; UPDATE chassis SET created_at = now() - interval '9 days'; ALTER TABLE chassis ENABLE TRIGGER chassis_status_guard`);
    const al = await as<{ kind: string }>("otk", `SELECT kind FROM chassis_alerts`);
    expect(al.map((a) => a.kind)).toContain("chassis_expected_old");
    const bal = await one<{ remaining: number }>("otk", `SELECT remaining FROM chassis_spec_balance WHERE spec_line_id = $1`, [line]);
    expect(Number(bal.remaining)).toBe(2);
    expect(await as("worker", `SELECT * FROM chassis_alerts`)).toHaveLength(0);
  });
});
