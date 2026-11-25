// Shassi qabul qilinganda 1C:УК ga «Приходная накладная» («Прием в переработку») QORALAMASINI yaratadi.
// - Hujjat hech qachon o'tkazilmaydi (Posted=false): buxgalter 1C'da tekshirib, tahrirlab, o'tkazadi yoki o'chiradi.
// - Kontragent ERP mijozining STIR (clients.inn) bo'yicha topiladi.
// - Takror yuborilsa ikkinchi hujjat yaratilmaydi (chassis.onec_intake_ref va 1C'dagi НомерВходящегоДокумента bo'yicha tekshiriladi).
// - Har urinish integration_log ga yoziladi (ko'pi bilan 5 urinish).
// Secrets: CLOBUS_UK_ODATA_URL, CLOBUS_UK_ODATA_USER, CLOBUS_UK_ODATA_PASSWORD
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildIntakeDoc, isGuid, odataStr, onecError, pickContract, UK, type OnecContract } from "../_shared/onecUk.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const MAX_ATTEMPTS = 5;

function onec() {
  const base = (Deno.env.get("CLOBUS_UK_ODATA_URL") ?? "https://clobus.uz/a/sbm/77249/odata/standard.odata").replace(/\/+$/, "");
  const user = Deno.env.get("CLOBUS_UK_ODATA_USER") ?? "";
  const pass = Deno.env.get("CLOBUS_UK_ODATA_PASSWORD") ?? "";
  if (!user || !pass) throw new Error("1C ulanish sozlanmagan: CLOBUS_UK_ODATA_USER / CLOBUS_UK_ODATA_PASSWORD secret'lari yo'q");
  const auth = "Basic " + btoa(String.fromCharCode(...new TextEncoder().encode(`${user}:${pass}`)));
  const call = async (method: string, path: string, params: Record<string, string> = {}, body?: unknown) => {
    const qs = new URLSearchParams({ ...params, $format: "json" }).toString();
    const r = await fetch(`${base}/${encodeURI(path)}?${qs}`, {
      method,
      headers: { Authorization: auth, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    const text = await r.text();
    if (!r.ok) throw new Error(onecError(r.status, text));
    return text ? JSON.parse(text) : {};
  };
  return {
    list: async (entity: string, params: Record<string, string>) => (await call("GET", entity, params)).value ?? [],
    create: (entity: string, body: unknown) => call("POST", entity, {}, body),
  };
}

async function findOrCreateNomenclature(c: ReturnType<typeof onec>): Promise<string> {
  const found = await c.list("Catalog_Номенклатура", {
    $filter: `Description eq ${odataStr(UK.chassisNomenclature)} and DeletionMark eq false`, $select: "Ref_Key", $top: "1",
  });
  if (found[0]?.Ref_Key) return found[0].Ref_Key;
  // Ma'lumotnoma elementi (hujjat emas). Buxgalter keyin to'ldiradi/o'zgartiradi.
  const made = await c.create("Catalog_Номенклатура", {
    Description: UK.chassisNomenclature,
    НаименованиеПолное: UK.chassisNomenclature,
    ТипНоменклатуры: "Запас",
    ЕдиницаИзмерения_Key: UK.unitPcs,
    Комментарий: "Создано ERP для приёма давальческих шасси (Прием в переработку)",
  });
  return made.Ref_Key;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = Deno.env.get("SUPABASE_URL")!;
  const userDb = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let logId: string | null = null;
  let chId: string | null = null;
  let attemptsN = 1;
  try {
    const { chassisId, force } = await req.json().catch(() => ({}));
    if (!chassisId) return json({ error: "chassisId majburiy" }, 400);

    // Foydalanuvchi shu shassini ko'ra oladimi (RLS) — ko'ra olmasa yubora olmaydi
    const { data: seen } = await userDb.from("chassis_overview").select("id").eq("id", chassisId).maybeSingle();
    if (!seen) return json({ error: "Shassi topilmadi yoki ruxsat yo'q" }, 403);
    chId = chassisId;

    const { data: ch, error } = await db.from("chassis")
      .select("id, vin, engine_no, intake_act_no, inbound_proxy, received_at, status, onec_intake_ref, client:clients(id, name, inn)")
      .eq("id", chassisId).single();
    if (error || !ch) throw new Error("Shassi topilmadi");
    if (ch.onec_intake_ref) return json({ ok: true, ref: ch.onec_intake_ref, already: true });
    if (ch.status === "expected" || !ch.received_at) return json({ error: "Shassi hali qabul qilinmagan" }, 400);

    const { data: prev } = await db.from("integration_log").select("id, status, attempts")
      .eq("entity", "chassis_intake").eq("erp_id", ch.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const attempts = (prev?.attempts ?? 0) + 1;
    attemptsN = attempts;
    if (prev && prev.status !== "ok" && prev.attempts >= MAX_ATTEMPTS && !force) {
      return json({ error: `${MAX_ATTEMPTS} marta urinildi. Xatoni tuzatib, «1C'ga qayta yuborish» tugmasini bosing.` }, 409);
    }
    if (prev && prev.status !== "ok") logId = prev.id;
    const log = async (patch: Record<string, unknown>) => {
      if (logId) await db.from("integration_log").update({ ...patch, attempts, updated_at: new Date().toISOString() }).eq("id", logId);
      else {
        const { data } = await db.from("integration_log").insert({ direction: "erp_to_1c", entity: "chassis_intake", erp_id: ch.id, attempts, ...patch }).select("id").single();
        logId = data?.id ?? null;
      }
    };

    const client = (ch as any).client as { id: string; name: string; inn: string | null } | null;
    if (!client?.inn) {
      await log({ status: "error", response: `Mijoz «${client?.name ?? "—"}» kartasida STIR (INN) yo'q` });
      return json({ error: `Mijoz «${client?.name ?? "—"}» kartasiga STIR (INN) kiriting, keyin qayta yuboring` }, 422);
    }

    const c = onec();
    // Takrorlanmasin: 1C'da shu qabul akti raqami bilan qoralama bormi
    if (ch.intake_act_no) {
      const dup = await c.list("Document_ПриходнаяНакладная", {
        $filter: `НомерВходящегоДокумента eq ${odataStr(ch.intake_act_no)} and DeletionMark eq false`, $select: "Ref_Key,Number", $top: "1",
      });
      if (dup[0]?.Ref_Key) {
        await db.from("chassis").update({ onec_intake_ref: dup[0].Ref_Key }).eq("id", ch.id);
        await log({ status: "ok", onec_ref: dup[0].Ref_Key, response: `1C'da allaqachon bor: ${dup[0].Number}` });
        return json({ ok: true, ref: dup[0].Ref_Key, number: dup[0].Number, already: true });
      }
    }

    const cps = await c.list("Catalog_Контрагенты", {
      $filter: `ИНН eq ${odataStr(client.inn)} and DeletionMark eq false and IsFolder eq false`, $select: "Ref_Key,Description", $top: "5",
    });
    if (!cps.length) {
      await log({ status: "error", response: `1C'da STIR ${client.inn} bilan kontragent yo'q` });
      return json({ error: `1C:УК da STIR ${client.inn} («${client.name}») bilan kontragent yo'q. Buxgalter kontragentni qo'shsin, keyin qayta yuboring.` }, 422);
    }
    const counterparty = cps[0].Ref_Key as string;

    const { data: specs } = await db.from("chassis_specs").select("contract_no").eq("client_id", client.id);
    const contracts: OnecContract[] = await c.list("Catalog_ДоговорыКонтрагентов", {
      $filter: `Owner eq cast(guid'${counterparty}', 'Catalog_Контрагенты')`,
      $select: "Ref_Key,Description,НомерДоговора,ВидДоговора,DeletionMark,Недействителен,Организация_Key",
    }).catch(() => []);
    const contract = pickContract(contracts, (specs ?? []).map((s: any) => s.contract_no));

    const nomenclature = await findOrCreateNomenclature(c);
    const body = buildIntakeDoc({
      vin: ch.vin, intakeActNo: ch.intake_act_no, receivedAt: ch.received_at, engineNo: ch.engine_no, proxy: ch.inbound_proxy,
      counterpartyKey: counterparty, contractKey: contract.key, nomenclatureKey: nomenclature,
    });
    await log({ status: "pending", request: body, response: null });
    const doc = await c.create("Document_ПриходнаяНакладная", body);
    if (!isGuid(doc?.Ref_Key)) throw new Error("1C hujjat havolasini qaytarmadi");
    if (doc.Posted) console.warn("1C hujjatni o'tkazilgan deb qaytardi", doc.Ref_Key);

    await db.from("chassis").update({ onec_intake_ref: doc.Ref_Key }).eq("id", ch.id);
    await log({ status: "ok", onec_ref: doc.Ref_Key, response: `Qoralama ${doc.Number ?? ""}; ${contract.why}` });
    return json({ ok: true, ref: doc.Ref_Key, number: doc.Number, contract: contract.why });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (logId) await db.from("integration_log").update({ status: "error", response: msg, updated_at: new Date().toISOString() }).eq("id", logId);
    else if (chId) await db.from("integration_log").insert({ direction: "erp_to_1c", entity: "chassis_intake", erp_id: chId, attempts: attemptsN, status: "error", response: msg });
    return json({ error: msg }, 502);
  }
});
