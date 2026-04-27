import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShieldCheck, Search, ExternalLink, Save } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { useI18n } from "@/i18n/context";
import { logAudit } from "@/types/erp";
import { toast } from "sonner";

type Filter = "all" | "red" | "yellow" | "green";

function otkColor(s: any): "red" | "yellow" | "green" {
  if (s.qc_passed) return "green";
  if (s.otk_comment && s.otk_comment.trim()) return "yellow";
  return "red";
}

const dotCls = { red: "bg-status-red", yellow: "bg-status-yellow", green: "bg-status-green" };
const labelCls = {
  red: "text-status-red border-status-red/30 bg-status-red/10",
  yellow: "text-status-yellow border-status-yellow/30 bg-status-yellow/10",
  green: "text-status-green border-status-green/30 bg-status-green/10",
};

export default function OtkPage() {
  const { user, hasRole } = useAuth();
  const { t } = useI18n();
  const [stages, setStages] = useState<any[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Record<string, { comment: string; passed: boolean; dirty: boolean }>>({});

  const load = async () => {
    const { data } = await supabase
      .from("order_stages")
      .select("*, order:orders(id, order_number, product_name, status, deadline)")
      .eq("qc_required", true)
      .order("created_at", { ascending: false });
    setStages(data ?? []);
    const map: any = {};
    (data ?? []).forEach((s: any) => { map[s.id] = { comment: s.otk_comment ?? "", passed: !!s.qc_passed, dirty: false }; });
    setEdit(map);
  };
  useEffect(() => { load(); }, []);

  const counts = useMemo(() => {
    const c = { red: 0, yellow: 0, green: 0 };
    stages.forEach((s) => { c[otkColor(s)]++; });
    return c;
  }, [stages]);

  const visible = stages.filter((s) => {
    if (filter !== "all" && otkColor(s) !== filter) return false;
    if (q && !(`${s.order?.order_number} ${s.order?.product_name} ${s.name}`.toLowerCase().includes(q.toLowerCase()))) return false;
    return true;
  });

  const save = async (s: any) => {
    const e = edit[s.id];
    const patch: any = {
      otk_comment: e.comment || null,
      qc_passed: e.passed,
    };
    if (e.passed) patch.otk_checked_at = new Date().toISOString();
    const { error } = await supabase.from("order_stages").update(patch).eq("id", s.id);
    if (error) { toast.error(error.message); return; }
    await logAudit(supabase, {
      actor_id: user?.id, actor_name: user?.email,
      action: e.passed ? "OTK o'tdi" : (e.comment ? "OTK izoh" : "OTK saqlandi"),
      entity: "stage", order_id: s.order_id, stage_id: s.id,
      details: `${s.order?.order_number} → ${s.name}: ${e.comment || (e.passed ? "o'tdi" : "")}`,
    });
    toast.success(t.otk.save);
    load();
  };

  const canEdit = hasRole(["admin", "manager", "marketing", "otk"]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><ShieldCheck className="h-6 w-6" /> {t.otk.title}</h1>
        <p className="text-sm text-muted-foreground">{t.otk.subtitle}</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {(["red", "yellow", "green"] as const).map((c) => (
          <Card key={c} className={`cursor-pointer ${filter === c ? "ring-2 ring-primary" : ""}`} onClick={() => setFilter(filter === c ? "all" : c)}>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <div className={`text-xs uppercase tracking-wide font-semibold ${c === "red" ? "text-status-red" : c === "yellow" ? "text-status-yellow" : "text-status-green"}`}>
                  {c === "red" ? t.otk.notChecked : c === "yellow" ? t.otk.commentOnly : t.otk.passed}
                </div>
                <div className="text-2xl font-bold mt-1">{counts[c]}</div>
              </div>
              <div className={`h-10 w-10 rounded-full ${dotCls[c]}`} />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
              <TabsList>
                <TabsTrigger value="all">{t.common.all}</TabsTrigger>
                <TabsTrigger value="red">🔴</TabsTrigger>
                <TabsTrigger value="yellow">🟡</TabsTrigger>
                <TabsTrigger value="green">🟢</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8 w-64" placeholder={t.common.search} value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {visible.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">—</p>}
          {visible.map((s) => {
            const color = otkColor(s);
            const e = edit[s.id] ?? { comment: "", passed: false, dirty: false };
            return (
              <Card key={s.id} className="border-l-4" style={{ borderLeftColor: color === "red" ? "hsl(var(--status-red))" : color === "yellow" ? "hsl(var(--status-yellow))" : "hsl(var(--status-green))" }}>
                <CardContent className="p-4 grid md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <Link to={`/orders/${s.order?.id}`} className="font-mono font-semibold text-primary hover:underline flex items-center gap-1 text-sm">
                      {s.order?.order_number} <ExternalLink className="h-3 w-3" />
                    </Link>
                    <div className="text-sm font-medium">{s.order?.product_name}</div>
                    <div className="text-xs text-muted-foreground">Bosqich {s.stage_order}: <span className="font-medium text-foreground">{s.name}</span></div>
                    <div className={`inline-flex items-center gap-1.5 mt-2 rounded-full border px-2 py-0.5 text-xs font-semibold ${labelCls[color]}`}>
                      <span className={`h-2 w-2 rounded-full ${dotCls[color]}`} />
                      {color === "red" ? t.otk.notChecked : color === "yellow" ? t.otk.commentOnly : t.otk.passed}
                    </div>
                  </div>

                  <div className="md:col-span-2 space-y-3">
                    <div>
                      <CardDescription className="text-xs mb-1">{t.otk.comment}</CardDescription>
                      <Textarea
                        rows={2}
                        disabled={!canEdit}
                        value={e.comment}
                        onChange={(ev) => setEdit({ ...edit, [s.id]: { ...e, comment: ev.target.value, dirty: true } })}
                        placeholder="Tekshiruv natijasi, kamchiliklar..."
                      />
                    </div>
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox
                          disabled={!canEdit}
                          checked={e.passed}
                          onCheckedChange={(v) => setEdit({ ...edit, [s.id]: { ...e, passed: !!v, dirty: true } })}
                        />
                        <span>{t.otk.checkPassed}</span>
                      </label>
                      {canEdit && (
                        <Button size="sm" disabled={!e.dirty} onClick={() => save(s)}>
                          <Save className="h-3.5 w-3.5 mr-1" /> {t.otk.save}
                        </Button>
                      )}
                    </div>
                    {s.otk_checked_at && (
                      <div className="text-[11px] text-muted-foreground">Oxirgi tasdiq: {new Date(s.otk_checked_at).toLocaleString("uz-UZ")}</div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
