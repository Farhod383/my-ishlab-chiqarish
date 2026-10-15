import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { fmtDate, fmtDateTime24, fmtDuration, fmtNum } from "@/lib/format";
import { displayUser } from "@/lib/userNames";
import { Eye, FileDown } from "lucide-react";

type Full = {
  order: any;
  stages: any[];
  materials: { name: string; unit: string; qty: number }[];
  defects: any[];
  tasks: any[];
};

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const mins = (a?: string | null, b?: string | null) => (a && b ? Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 60000) : null);
const RES: Record<string, string> = { rework: "Qayta ishlash", write_off: "Hisobdan chiqarish", pending: "Kutilmoqda" };
// Row caps keep each order's report within 2 A4 pages.
const CAP = { stages: 22, materials: 22, defects: 6, tasks: 10 };

function capRows<T>(arr: T[], n: number) { return { rows: arr.slice(0, n), rest: Math.max(0, arr.length - n) }; }

export function orderReportHtml(f: Full): string {
  const o = f.order;
  const start = f.stages.map((s) => s.started_at).filter(Boolean).sort()[0] ?? null;
  const end = f.stages.map((s) => s.finished_at).filter(Boolean).sort().slice(-1)[0] ?? null;
  const total = mins(start, end);
  const st = capRows(f.stages, CAP.stages), mt = capRows(f.materials, CAP.materials), df = capRows(f.defects, CAP.defects), tk = capRows(f.tasks, CAP.tasks);
  const more = (n: number, cols: number) => (n ? `<tr><td colspan="${cols}" class="more">… yana ${n} ta yozuv</td></tr>` : "");
  const none = (cols: number) => `<tr><td colspan="${cols}" class="more">Ma'lumot yo'q</td></tr>`;
  const otk = (s: any) => !s.qc_required ? "Talab qilinmaydi" : s.qc_passed === true ? "Tasdiqlandi" : s.qc_passed === false ? "Rad etildi" : "Tekshirilmagan";
  return `<section class="order">
  <h1>${esc(o.order_number)} — ${esc(o.product_name)}</h1>
  <table class="meta"><tr><td><b>Klient:</b> ${esc(displayUser(o.client?.name ?? "—"))}</td><td><b>Miqdor:</b> ${esc(o.quantity)} dona</td></tr>
  <tr><td><b>Boshlangan:</b> ${fmtDateTime24(start)}</td><td><b>Tugagan:</b> ${fmtDateTime24(end)}</td></tr>
  <tr><td><b>Umumiy davomiylik:</b> ${total == null ? "—" : fmtDuration(total)}</td><td><b>Qabul qilingan / muddat:</b> ${fmtDate(o.order_date)} / ${fmtDate(o.deadline)}</td></tr></table>
  <h2>Bosqichlar</h2><table><thead><tr><th>№</th><th>Bosqich</th><th>Xodim(lar)</th><th>Boshlandi</th><th>Tugadi</th><th>Vaqt</th><th>OTK</th></tr></thead><tbody>
  ${st.rows.map((s) => { const m = mins(s.started_at, s.finished_at); return `<tr><td>${s.stage_order}</td><td>${esc(s.name)}${s.otk_comment ? `<div class="sub">OTK: ${esc(s.otk_comment)}</div>` : ""}</td><td>${esc(s.worker_name ? String(s.worker_name).split(",").map((n: string) => displayUser(n.trim())).join(", ") : "—")}</td><td>${fmtDateTime24(s.started_at)}</td><td>${fmtDateTime24(s.finished_at)}</td><td>${m == null ? "—" : fmtDuration(m)}</td><td>${otk(s)}</td></tr>`; }).join("") || none(7)}${more(st.rest, 7)}</tbody></table>
  <h2>Xodimlar bajargan ishlar</h2><table><thead><tr><th>Sana</th><th>Xodim</th><th>Vazifa</th><th>Bajarilishi</th></tr></thead><tbody>
  ${tk.rows.map((t) => `<tr><td>${fmtDate(t.task_date)}</td><td>${esc(displayUser(t.employee?.full_name ?? "—"))}</td><td>${esc(t.task_title)}</td><td>${t.progress}%</td></tr>`).join("") || none(4)}${more(tk.rest, 4)}</tbody></table>
  <h2>Sarflangan materiallar va detallar</h2><table><thead><tr><th>Nomi</th><th>Miqdori</th><th>Birlik</th></tr></thead><tbody>
  ${mt.rows.map((m) => `<tr><td>${esc(m.name)}</td><td>${fmtNum(m.qty)}</td><td>${esc(m.unit)}</td></tr>`).join("") || none(3)}${more(mt.rest, 3)}</tbody></table>
  <h2>Brak va qayta ishlash</h2><table><thead><tr><th>Sana</th><th>Detal</th><th>Miqdor</th><th>Sabab</th><th>Qaror</th></tr></thead><tbody>
  ${df.rows.map((d) => `<tr><td>${fmtDate(d.created_at)}</td><td>${esc(d.product?.name ?? "—")}</td><td>${fmtNum(d.quantity)}</td><td>${esc(d.reason ?? "—")}</td><td>${RES[d.resolution] ?? esc(d.resolution)}</td></tr>`).join("") || none(5)}${more(df.rest, 5)}</tbody></table>
</section>`;
}

const CSS = `@page{size:A4;margin:12mm} body{font-family:Arial,sans-serif;color:#111;background:#fff;margin:0;font-size:11px}
.order{page-break-before:always;padding:4px} .order:first-child{page-break-before:auto}
h1{font-size:16px;margin:0 0 6px} h2{font-size:12.5px;margin:10px 0 4px;border-bottom:1px solid #bbb;padding-bottom:2px}
table{width:100%;border-collapse:collapse;table-layout:auto} th,td{border:1px solid #ccc;padding:3px 5px;text-align:left;vertical-align:top}
th{background:#f2f2f2;font-size:10.5px} tr{break-inside:avoid} .meta td{border:none;padding:2px 0} .sub{color:#555;font-size:10px}
.more{color:#666;font-style:italic;text-align:center}`;
const wrap = (body: string, print = false) => `<!doctype html><html><head><meta charset="utf-8"><title>Tugallangan zakazlar hisoboti</title><style>${CSS}</style></head><body>${body}${print ? "<script>window.onload=()=>window.print()</script>" : ""}</body></html>`;

async function loadFull(ids: string[]): Promise<Map<string, Full>> {
  const [o, s, mv, d, t] = await Promise.all([
    supabase.from("orders").select("*, client:clients(name)").in("id", ids),
    supabase.from("order_stages").select("*").in("order_id", ids).order("stage_order"),
    supabase.from("stock_movements").select("order_id, quantity, direction, product:products(name, unit)").in("order_id", ids).eq("direction", "out"),
    supabase.from("defects").select("*, product:products(name)").in("order_id", ids).order("created_at"),
    supabase.from("daily_tasks").select("*, employee:employees(full_name)").in("order_id", ids).order("task_date"),
  ]);
  const map = new Map<string, Full>();
  (o.data ?? []).forEach((ord: any) => map.set(ord.id, { order: ord, stages: [], materials: [], defects: [], tasks: [] }));
  (s.data ?? []).forEach((x: any) => map.get(x.order_id)?.stages.push(x));
  (d.data ?? []).forEach((x: any) => map.get(x.order_id)?.defects.push(x));
  (t.data ?? []).forEach((x: any) => map.get(x.order_id)?.tasks.push(x));
  const agg = new Map<string, Map<string, { name: string; unit: string; qty: number }>>();
  (mv.data ?? []).forEach((x: any) => {
    const name = x.product?.name ?? "Mahsulot ko'rsatilmagan"; const unit = x.product?.unit ?? "";
    const m = agg.get(x.order_id) ?? new Map(); agg.set(x.order_id, m);
    const k = `${name}|${unit}`; const cur = m.get(k) ?? { name, unit, qty: 0 }; cur.qty += Number(x.quantity) || 0; m.set(k, cur);
  });
  agg.forEach((m, id) => { const f = map.get(id); if (f) f.materials = [...m.values()].sort((a, b) => a.name.localeCompare(b.name)); });
  return map;
}

export function CompletedOrdersReport({ open, onOpenChange, rows }: { open: boolean; onOpenChange: (v: boolean) => void; rows: any[] }) {
  const done = useMemo(() => rows.filter((r) => r.status === "completed")
    .sort((a, b) => String(a.order_number).localeCompare(String(b.order_number)) || String(a.product_name).localeCompare(String(b.product_name))), [rows]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setSel(new Set(done.map((d) => d.id))); setPreview(null); } }, [open, done]);

  const build = async (ids: string[]) => {
    const map = await loadFull(ids);
    return ids.map((id) => map.get(id)).filter(Boolean).map((f) => orderReportHtml(f!)).join("");
  };
  const show = async (ids: string[]) => { setBusy(true); try { setPreview(wrap(await build(ids))); } finally { setBusy(false); } };
  const download = async () => {
    setBusy(true);
    try {
      const ids = done.filter((d) => sel.has(d.id)).map((d) => d.id);
      const map = await loadFull(ids);
      const { buildCompletedPdf, todayFile } = await import("@/lib/pdfExport");
      const doc = await buildCompletedPdf(ids.map((id) => map.get(id)).filter(Boolean) as Full[]);
      doc.save(`Tugallangan_zakazlar_hisoboti_${todayFile()}.pdf`);
    } finally { setBusy(false); }
  };
  const ids = done.filter((d) => sel.has(d.id)).map((d) => d.id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90dvh] flex flex-col">
        <DialogHeader><DialogTitle>Tugallangan zakazlar hisoboti ({done.length})</DialogTitle></DialogHeader>
        <div className="flex flex-wrap gap-2 items-center">
          <Button variant="outline" size="sm" onClick={() => setSel(sel.size === done.length ? new Set() : new Set(done.map((d) => d.id)))}>
            {sel.size === done.length ? "Hammasini bekor qilish" : "Hammasini tanlash"}
          </Button>
          <span className="text-sm text-muted-foreground">{ids.length} ta tanlangan</span>
          <div className="ml-auto flex gap-2">
            {preview && <Button variant="outline" size="sm" onClick={() => setPreview(null)}>Ro'yxatga qaytish</Button>}
            <Button variant="outline" size="sm" disabled={!ids.length || busy} onClick={() => show(ids)}><Eye className="h-4 w-4 mr-1" />Hisobotni ko'rish</Button>
            <Button size="sm" disabled={!ids.length || busy} onClick={download}><FileDown className="h-4 w-4 mr-1" />PDF yuklab olish</Button>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-auto border rounded-md">
          {preview ? (
            <iframe title="Hisobot" srcDoc={preview} className="w-full h-[65dvh] bg-background" />
          ) : (
            <div>
              {done.map((o) => (
                <div key={o.id} className="flex items-center gap-3 px-3 py-2 border-b text-sm">
                  <Checkbox checked={sel.has(o.id)} onCheckedChange={(v) => { const n = new Set(sel); v ? n.add(o.id) : n.delete(o.id); setSel(n); }} />
                  <span className="font-mono w-28">{o.order_number}</span>
                  <span className="flex-1 truncate">{o.product_name}</span>
                  <span className="text-muted-foreground truncate max-w-[160px]">{displayUser(o.client?.name ?? "—")}</span>
                  <Button variant="ghost" size="sm" disabled={busy} onClick={() => show([o.id])}><Eye className="h-4 w-4 mr-1" />Ko'rish</Button>
                </div>
              ))}
              {!done.length && <div className="p-6 text-center text-muted-foreground">Tugallangan zakazlar yo'q</div>}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
