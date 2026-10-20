import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { useLocalize } from "@/i18n/context";
import { matchesAcrossScripts } from "@/lib/translit";
import { ArrowDownAZ, ArrowUpZA, Search } from "lucide-react";
import { fmtDate } from "@/lib/format";

type Client = { id: string; name: string; client_type: string | null };

export function ClientOrdersView({ rows }: { rows: any[] }) {
  const nav = useNavigate();
  const localize = useLocalize();
  const [clients, setClients] = useState<Client[]>([]);
  const [q, setQ] = useState("");
  const [asc, setAsc] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("clients").select("id, name, client_type").then(({ data }) => setClients((data as Client[]) ?? []));
  }, []);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((o) => o.client_id && m.set(o.client_id, (m.get(o.client_id) ?? 0) + 1));
    return m;
  }, [rows]);

  const list = clients
    .filter((c) => !q || matchesAcrossScripts(c.name ?? "", q))
    .sort((a, b) => (asc ? 1 : -1) * (a.name ?? "").localeCompare(b.name ?? "", "uz"));

  const sel = clients.find((c) => c.id === selected);
  const orders = rows
    .filter((o) => o.client_id === selected)
    .sort((a, b) => String(b.order_date).localeCompare(String(a.order_date)));

  return (
    <div className="grid gap-4 md:grid-cols-[300px_1fr]">
      <div className="border rounded-md flex flex-col max-h-[70vh]">
        <div className="p-2 flex gap-2 border-b">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Mijoz qidirish" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Button variant="outline" size="icon" onClick={() => setAsc((v) => !v)} title={asc ? "A–Z" : "Z–A"}>
            {asc ? <ArrowDownAZ className="h-4 w-4" /> : <ArrowUpZA className="h-4 w-4" />}
          </Button>
        </div>
        <div className="overflow-auto">
          {list.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelected(c.id)}
              className={`w-full text-left px-3 py-2 text-sm border-b flex justify-between gap-2 hover:bg-muted ${selected === c.id ? "bg-primary/10 font-semibold" : ""}`}
            >
              <span className="truncate">{localize(c.name)}</span>
              <span className="text-xs text-muted-foreground">{counts.get(c.id) ?? 0}</span>
            </button>
          ))}
          {list.length === 0 && <div className="p-4 text-sm text-muted-foreground text-center">Mijoz topilmadi</div>}
        </div>
      </div>

      <div className="border rounded-md overflow-x-auto">
        {!sel ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Zakazlarini ko‘rish uchun mijozni tanlang</div>
        ) : (
          <>
            <div className="p-3 border-b font-semibold">{localize(sel.name)} — {orders.length} ta zakaz</div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Raqam</TableHead>
                  <TableHead>Mahsulot</TableHead>
                  <TableHead>Muddat</TableHead>
                  <TableHead>Joriy bosqich</TableHead>
                  <TableHead className="w-40">Progress</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => {
                  const st = (o.order_stages ?? []).slice().sort((a: any, b: any) => a.stage_order - b.stage_order);
                  const done = st.filter((s: any) => s.status === "completed").length;
                  const pct = st.length ? Math.round((done / st.length) * 100) : o.status === "completed" ? 100 : 0;
                  const cur = st.find((s: any) => s.status === "in_progress" || s.status === "delayed") ?? st.find((s: any) => s.status !== "completed");
                  const isDone = o.status === "completed";
                  const isExc = o.priority === "exception" && !isDone;
                  return (
                    <TableRow key={o.id} className={`cursor-pointer hover:bg-muted/50 ${isDone ? "order-row-done" : isExc ? "order-row-exception" : ""}`} onClick={() => nav(`/orders/${o.id}`)}>
                      <TableCell className="font-mono text-sm">{o.order_number}</TableCell>
                      <TableCell className="text-sm">{localize(o.product_name)}</TableCell>
                      <TableCell className="text-sm whitespace-nowrap">{fmtDate(o.deadline)}</TableCell>
                      <TableCell className="text-sm">{o.status === "completed" ? "Tugallangan" : cur ? localize(cur.name) : "—"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2"><Progress value={pct} className="h-2" /><span className="text-xs w-9">{pct}%</span></div>
                      </TableCell>
                      <TableCell><StatusBadge status={o.status} solid /></TableCell>
                    </TableRow>
                  );
                })}
                {orders.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Bu mijozda zakaz yo‘q</TableCell></TableRow>}
              </TableBody>
            </Table>
          </>
        )}
      </div>
    </div>
  );
}
