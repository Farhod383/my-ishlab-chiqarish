import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronUp, Filter, X } from "lucide-react";
import { ORDER_GROUPS } from "@/lib/orderGroups";
import { EMPTY_FILTERS, activeFilterCount, type OrderFilters } from "@/lib/orderFilters";

const ALL = "__all";

export function OrderFiltersPanel({ rows, value, onChange, resultCount }: {
  rows: any[]; value: OrderFilters; onChange: (f: OrderFilters) => void; resultCount: number;
}) {
  const [more, setMore] = useState(false);
  const set = <K extends keyof OrderFilters>(k: K, v: OrderFilters[K]) => onChange({ ...value, [k]: v });
  const stageNames = useMemo(() => [...new Set(rows.flatMap((o) => (o.order_stages ?? []).map((s: any) => s.name).filter(Boolean)))].sort(), [rows]);
  const workers = useMemo(() => [...new Set(rows.flatMap((o) => (o.order_stages ?? []).map((s: any) => s.worker_name).filter(Boolean)))].sort(), [rows]);
  const n = activeFilterCount(value);

  const txt = (k: "number" | "product" | "client", label: string, ph: string) => (
    <div className="space-y-1"><Label className="text-xs">{label}</Label>
      <Input className="h-9" value={value[k]} placeholder={ph} onChange={(e) => set(k, e.target.value)} /></div>
  );
  const sel = (k: keyof OrderFilters, label: string, opts: { v: string; l: string }[], allValue: string) => (
    <div className="space-y-1"><Label className="text-xs">{label}</Label>
      <Select value={(value[k] as string) === allValue ? ALL : (value[k] as string)} onValueChange={(v) => set(k, (v === ALL ? allValue : v) as any)}>
        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
        <SelectContent className="max-h-72">
          <SelectItem value={ALL}>Barchasi</SelectItem>
          {opts.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
        </SelectContent>
      </Select></div>
  );
  const range = (a: keyof OrderFilters, b: keyof OrderFilters, label: string, type = "date") => (
    <div className="space-y-1"><Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-1">
        <Input type={type} className="h-9 min-w-0" placeholder="dan (ixtiyoriy)" value={value[a] as string} onChange={(e) => set(a, e.target.value as any)} />
        <span className="text-muted-foreground text-xs">—</span>
        <Input type={type} className="h-9 min-w-0" placeholder="gacha (ixtiyoriy)" value={value[b] as string} onChange={(e) => set(b, e.target.value as any)} />
      </div></div>
  );

  return (
    <Card>
      <CardContent className="p-3 sm:p-4 space-y-3" data-filter-panel>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <Filter className="h-4 w-4" />Filterlar
            {n > 0 && <span className="rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs">{n} ta faol</span>}
            <span className="text-xs font-normal text-muted-foreground">Natija: {resultCount} ta zakaz</span>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setMore((v) => !v)}>
              {more ? <ChevronUp className="h-4 w-4 mr-1" /> : <ChevronDown className="h-4 w-4 mr-1" />}{more ? "Kamroq" : "Ko'proq filtrlar"}
            </Button>
            <Button size="sm" variant="outline" disabled={n === 0} onClick={() => onChange(EMPTY_FILTERS)}><X className="h-4 w-4 mr-1" />Filtrlarni tozalash</Button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {txt("number", "Zakaz raqami", "Masalan: 01I2666 (ixtiyoriy)")}
          {txt("product", "Mahsulot nomi", "Mahsulot (ixtiyoriy)")}
          {txt("client", "Klient", "Klient nomi (ixtiyoriy)")}
          {sel("status", "Holat", [
            { v: "pending", l: "Kutilmoqda" }, { v: "in_progress", l: "Jarayonda" },
            { v: "completed", l: "Tugallangan" }, { v: "delayed", l: "Kechikkan" },
          ], "all")}
        </div>
        {more && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {sel("group", "Zakaz guruhi", ORDER_GROUPS.map((g) => ({ v: g.key, l: g.label })), "ALL")}
            {sel("stage", "Bosqich nomi", stageNames.map((s) => ({ v: s, l: s })), "")}
            {sel("worker", "Mas'ul xodim", workers.map((s) => ({ v: s, l: s })), "")}
            {sel("priority", "Muhimlik", [{ v: "normal", l: "Oddiy" }, { v: "exception", l: "Istisno" }], "all")}
            {range("orderFrom", "orderTo", "Olingan sana")}
            {range("startFrom", "startTo", "Ishlab chiqarish boshlangan")}
            {range("deadlineFrom", "deadlineTo", "Muddat")}
            {range("finishFrom", "finishTo", "Haqiqiy tugash sanasi")}
            {range("progressMin", "progressMax", "Bajarilish foizi (%)", "number")}
            {sel("stock", "Sklad holati", [{ v: "low", l: "Kam qolgan materiali bor" }, { v: "ok", l: "Kam qolgan materiali yo'q" }], "all")}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
