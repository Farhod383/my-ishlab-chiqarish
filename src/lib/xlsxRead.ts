// Kutubxonasiz .xlsx o'quvchi: zip → birinchi varaq → qatorlar (matn ko'rinishida).
// Faqat Didox kabi oddiy jadvallar uchun: formulalar natijasi (<v>) va umumiy satrlar (sharedStrings) o'qiladi.

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate-raw");
  const stream = new Blob([data.slice().buffer]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzip(buf: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const b = new Uint8Array(buf);
  const dv = new DataView(buf);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65_557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("Bu .xlsx fayl emas");
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out = new Map<string, Uint8Array>();
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(b.subarray(p + 46, p + 46 + nameLen));
    const lNameLen = dv.getUint16(local + 26, true), lExtraLen = dv.getUint16(local + 28, true);
    const start = local + 30 + lNameLen + lExtraLen;
    const raw = b.subarray(start, start + csize);
    if (/^xl\/(sharedStrings\.xml|workbook\.xml|worksheets\/sheet\d+\.xml)$/.test(name)) out.set(name, method === 0 ? raw : await inflateRaw(raw));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

function colIndex(ref: string): number {
  const letters = ref.replace(/\d+/g, "");
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Birinchi varaqni qatorlar massivi sifatida qaytaradi */
export async function readXlsxRows(file: Blob): Promise<string[][]> {
  const files = await unzip(await file.arrayBuffer());
  const dec = new TextDecoder();
  const parser = new DOMParser();
  const shared: string[] = [];
  const ss = files.get("xl/sharedStrings.xml");
  if (ss) {
    const doc = parser.parseFromString(dec.decode(ss), "application/xml");
    for (const si of Array.from(doc.getElementsByTagName("si"))) shared.push(Array.from(si.getElementsByTagName("t")).map((t) => t.textContent ?? "").join(""));
  }
  const sheetName = [...files.keys()].filter((k) => k.startsWith("xl/worksheets/")).sort()[0];
  if (!sheetName) throw new Error("Faylda varaq topilmadi");
  const doc = parser.parseFromString(dec.decode(files.get(sheetName)!), "application/xml");
  const rows: string[][] = [];
  for (const row of Array.from(doc.getElementsByTagName("row"))) {
    const cells: string[] = [];
    for (const c of Array.from(row.getElementsByTagName("c"))) {
      const ref = c.getAttribute("r") ?? "";
      const type = c.getAttribute("t");
      let v = "";
      if (type === "inlineStr") v = Array.from(c.getElementsByTagName("t")).map((t) => t.textContent ?? "").join("");
      else {
        const raw = c.getElementsByTagName("v")[0]?.textContent ?? "";
        v = type === "s" ? shared[Number(raw)] ?? "" : raw;
      }
      cells[ref ? colIndex(ref) : cells.length] = v;
    }
    rows.push(Array.from(cells, (x) => x ?? ""));
  }
  return rows;
}

/** Excel sana raqami yoki "dd.mm.yyyy" → "yyyy-mm-dd" */
export function excelDate(v: string): string | null {
  const s = v.trim();
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(s)) * 86_400_000);
    return d.toISOString().slice(0, 10);
  }
  const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? iso[0] : null;
}
