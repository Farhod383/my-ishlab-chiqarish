// 1C:Управление компанией (clobus.uz, sbm/77249) — OData yordamchilari.
// Bu faylda Deno/npm importi yo'q: vitest ham, edge function ham ishlata oladi.
// Hamma hujjat 1C'ga O'TKAZILMAGAN QORALAMA bo'lib tushadi (Posted=false) — buxgalter tekshirib o'tkazadi.

// 1C:УК dagi doimiy ma'lumotlar (25.11.2026 da OData'dan o'qilgan)
export const UK = {
  organization: "6eae1a8e-c6f9-11f1-817c-043f72d861a4", // "Mcity" MChJ
  department: "750e6cc5-c6f9-11f1-817c-043f72d861a4", // Основное подразделение
  warehouse: "750e6cc6-c6f9-11f1-817c-043f72d861a4", // Основной склад
  currency: "812c8d8a-c6f9-11f1-817c-043f72d861a4", // so'm
  vatNone: "812c8ff3-c6f9-11f1-817c-043f72d861a4", // Без НДС
  unitPcs: "7b2de355-c6f9-11f1-817c-043f72d861a4", // шт (КлассификаторЕдиницИзмерения)
  chassisNomenclature: "Шасси давальческое (заказчика)",
} as const;

export const EMPTY = "00000000-0000-0000-0000-000000000000";
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isGuid = (s: unknown): s is string => typeof s === "string" && GUID.test(s) && s !== EMPTY;

/** OData $filter ichidagi satr: ' → '' */
export const odataStr = (s: string) => `'${s.replace(/'/g, "''")}'`;

export type IntakeInput = {
  vin: string;
  intakeActNo: string | null;
  receivedAt: string; // ISO
  engineNo?: string | null;
  proxy?: string | null;
  counterpartyKey: string;
  contractKey: string | null;
  nomenclatureKey: string;
};

/** 1C vaqti: zonasiz, Toshkent vaqti (YYYY-MM-DDTHH:mm:ss) */
export function tashkentLocal(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 5 * 3600_000);
  return d.toISOString().slice(0, 19);
}

/** «Приходная накладная» — «Прием в переработку», давальческое шасси, summasiz, qoralama */
export function buildIntakeDoc(x: IntakeInput) {
  if (!isGuid(x.counterpartyKey)) throw new Error("1C kontragenti aniqlanmagan");
  if (!isGuid(x.nomenclatureKey)) throw new Error("1C nomenklaturasi aniqlanmagan");
  const when = tashkentLocal(x.receivedAt);
  const note = [`ERP: давальческое шасси VIN ${x.vin}`, x.engineNo ? `двигатель ${x.engineNo}` : null,
    x.intakeActNo ? `акт приёма ${x.intakeActNo}` : null, x.proxy ? `доверенность ${x.proxy}` : null]
    .filter(Boolean).join("; ");
  return {
    Date: when,
    Posted: false,
    DeletionMark: false,
    ВидОперации: "ПриемВПереработку",
    Организация_Key: UK.organization,
    Подразделение_Key: UK.department,
    СтруктурнаяЕдиница_Key: UK.warehouse,
    ПоложениеСклада: "ВШапке",
    Контрагент_Key: x.counterpartyKey,
    Договор_Key: isGuid(x.contractKey) ? x.contractKey : EMPTY,
    ВалютаДокумента_Key: UK.currency,
    Курс: 1,
    Кратность: "1",
    СуммаВключаетНДС: true,
    СуммаДокумента: 0,
    НомерВходящегоДокумента: x.intakeActNo ?? "",
    ДатаВходящегоДокумента: when,
    Комментарий: `${note}. Создано из ERP как черновик — проверьте и проведите.`,
    Запасы: [{
      LineNumber: "1",
      Номенклатура_Key: x.nomenclatureKey,
      ЕдиницаИзмерения: UK.unitPcs,
      ЕдиницаИзмерения_Type: "StandardODATA.Catalog_КлассификаторЕдиницИзмерения",
      Количество: 1,
      Цена: 0,
      Сумма: 0,
      СтавкаНДС_Key: UK.vatNone,
      СуммаНДС: 0,
      Всего: 0,
      Содержание: `Шасси VIN ${x.vin}`,
      Комментарий: x.vin,
      СтруктурнаяЕдиница_Key: UK.warehouse,
    }],
  };
}

export type OnecContract = { Ref_Key: string; Description?: string; НомерДоговора?: string; ВидДоговора?: string; DeletionMark?: boolean; Недействителен?: boolean; Организация_Key?: string };

const normNo = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[№\s]/g, "");

/** Shartnoma tanlash: ERP spetsifikatsiyasidagi shartnoma raqami bilan mos kelgani, bo'lmasa yagona «С покупателем». */
export function pickContract(list: OnecContract[], erpContractNos: string[]): { key: string | null; why: string } {
  const live = list.filter((c) => !c.DeletionMark && !c.Недействителен && (!c.Организация_Key || c.Организация_Key === UK.organization || c.Организация_Key === EMPTY));
  const wanted = erpContractNos.map(normNo).filter(Boolean);
  const byNo = live.filter((c) => wanted.includes(normNo(c.НомерДоговора)));
  if (byNo.length === 1) return { key: byNo[0].Ref_Key, why: `shartnoma № ${byNo[0].НомерДоговора}` };
  const buyer = live.filter((c) => c.ВидДоговора === "СПокупателем");
  if (byNo.length > 1) return { key: null, why: "bir xil raqamli bir nechta shartnoma — buxgalter tanlaydi" };
  if (buyer.length === 1) return { key: buyer[0].Ref_Key, why: `yagona «С покупателем»: ${buyer[0].Description ?? ""}` };
  if (live.length === 1) return { key: live[0].Ref_Key, why: `yagona shartnoma: ${live[0].Description ?? ""}` };
  return { key: null, why: live.length ? "bir nechta shartnoma — buxgalter qoralamada tanlaydi" : "1C'da shartnoma yo'q — buxgalter qoralamada tanlaydi" };
}

/** 1C OData xatosidan qisqa matn */
export function onecError(status: number, text: string): string {
  try {
    const j = JSON.parse(text);
    const m = j?.["odata.error"]?.message?.value;
    if (m) return `1C ${status}: ${String(m).slice(0, 300)}`;
  } catch { /* matn JSON emas */ }
  return `1C ${status}: ${text.replace(/\s+/g, " ").slice(0, 300)}`;
}
