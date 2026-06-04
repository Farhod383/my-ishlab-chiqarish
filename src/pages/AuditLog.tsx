import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Search } from "lucide-react";
import { useI18n, useLocalize } from "@/i18n/context";
import { searchNorm } from "@/lib/translit";

export default function AuditLog() {
  const { t } = useI18n();
  const localize = useLocalize();
  const [logs, setLogs] = useState<any[]>([]);
  const [roleMap, setRoleMap] = useState<Record<string, string[]>>({});
  const [q, setQ] = useState("");
  const [userFilter, setUserFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  useEffect(() => {
    (async () => {
      const [{ data: l }, { data: r }] = await Promise.all([
        supabase.from("audit_log").select("*, order:orders(order_number), stage:order_stages(name, worker_name)").order("created_at", { ascending: false }).limit(500),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      setLogs(l ?? []);
      const rm: Record<string, string[]> = {};
      (r ?? []).forEach((x: any) => { (rm[x.user_id] ||= []).push(x.role); });
      setRoleMap(rm);
    })();
  }, []);

  const users = useMemo(() => {
    const m = new Map<string, string>();
    logs.forEach(l => { if (l.actor_name) m.set(l.actor_name, l.actor_name); });
    return Array.from(m.values()).sort();
  }, [logs]);

  const actions = useMemo(() => Array.from(new Set(logs.map(l => l.action))).sort(), [logs]);

  const filtered = useMemo(() => logs.filter(l => {
    if (q && !(searchNorm(`${l.action} ${l.details ?? ""} ${l.actor_name ?? ""}`).includes(searchNorm(q)))) return false;
    if (userFilter !== "all" && l.actor_name !== userFilter) return false;
    if (actionFilter !== "all" && l.action !== actionFilter) return false;
    if (roleFilter !== "all") {
      const roles = l.actor_id ? roleMap[l.actor_id] ?? [] : [];
      if (!roles.includes(roleFilter)) return false;
    }
    if (from && new Date(l.created_at) < new Date(from)) return false;
    if (to && new Date(l.created_at) > new Date(`${to}T23:59:59`)) return false;
    return true;
  }), [logs, q, userFilter, actionFilter, roleFilter, from, to, roleMap]);

  const roleLabel = (uid?: string | null) => {
    if (!uid) return "—";
    const rs = roleMap[uid] ?? [];
    return rs.map(r => (t.roles as any)[r] ?? r).join(", ") || "—";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><ShieldCheck className="h-6 w-6 text-primary" />{t.audit.title}</h1>
          <p className="text-sm text-muted-foreground">{t.audit.subtitle}</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-6 gap-3">
          <div className="relative md:col-span-2">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder={t.common.search} value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <Select value={userFilter} onValueChange={setUserFilter}>
            <SelectTrigger><SelectValue placeholder={(t.audit as any).user} /></SelectTrigger>
            <SelectContent><SelectItem value="all">{(t.audit as any).allUsers}</SelectItem>{users.map(u => <SelectItem key={u} value={u}>{localize(u)}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger><SelectValue placeholder={(t.audit as any).role} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{(t.audit as any).allRoles}</SelectItem>
              {["admin","marketing","manager","warehouse","supply","otk","hr","cashier","engineer"].map(r => (
                <SelectItem key={r} value={r}>{(t.roles as any)[r] ?? r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger><SelectValue placeholder={(t.audit as any).action} /></SelectTrigger>
            <SelectContent><SelectItem value="all">{(t.audit as any).allActions}</SelectItem>{actions.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
          </Select>
          <div className="flex gap-2">
            <Input type="date" value={from} onChange={e => setFrom(e.target.value)} />
            <Input type="date" value={to} onChange={e => setTo(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.audit.cols.date}</TableHead>
                  <TableHead>{t.audit.cols.who}</TableHead>
                  <TableHead>{(t.audit.cols as any).role}</TableHead>
                  <TableHead>{t.audit.cols.action}</TableHead>
                  <TableHead>{t.audit.cols.order}</TableHead>
                  <TableHead>{(t.audit.cols as any).stageWorker}</TableHead>
                  <TableHead>{t.audit.cols.details}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(l => (
                  <TableRow key={l.id}>
                    <TableCell className="text-xs whitespace-nowrap">{new Date(l.created_at).toLocaleString()}</TableCell>
                    <TableCell className="text-sm">{l.actor_name ? localize(l.actor_name) : t.common.system}</TableCell>
                    <TableCell className="text-xs"><Badge variant="secondary">{roleLabel(l.actor_id)}</Badge></TableCell>
                    <TableCell className="text-sm font-medium">{l.action}</TableCell>
                    <TableCell className="text-sm font-mono">{l.order?.order_number ?? "—"}</TableCell>
                    <TableCell className="text-xs">{l.stage?.name ?? "—"}{l.stage?.worker_name ? ` · ${String(l.stage.worker_name).split(",").map((n: string) => localize(n.trim())).join(", ")}` : ""}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{l.details ?? "—"}</TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">{t.audit.none}</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
