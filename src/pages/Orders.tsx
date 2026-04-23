import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge, PriorityBadge, HealthDot } from "@/components/StatusBadge";
import { orderHealth, type OrderRow } from "@/types/erp";
import { useAuth } from "@/auth/AuthContext";
import { Plus, Search } from "lucide-react";

export default function Orders() {
  const { hasRole } = useAuth();
  const [rows, setRows] = useState<(OrderRow & { client?: any })[]>([]);
  const [filter, setFilter] = useState<"all" | "active" | "exception" | "delayed" | "completed">("all");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("orders")
        .select("*, client:clients(name), order_stages(stage_order, started_at)")
        .order("priority", { ascending: false })
        .order("queue_position");
      setRows((data as any) ?? []);
      setLoading(false);
    })();
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const filtered = rows.filter((o) => {
    if (q && !o.order_number.toLowerCase().includes(q.toLowerCase()) && !o.product_name.toLowerCase().includes(q.toLowerCase())) return false;
    if (filter === "active") return o.status === "in_progress" || o.status === "pending";
    if (filter === "exception") return o.priority === "exception";
    if (filter === "delayed") return o.status === "delayed" || (o.status !== "completed" && o.deadline < today);
    if (filter === "completed") return o.status === "completed";
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Zakazlar</h1>
          <p className="text-sm text-muted-foreground">Navbat asosida ishlaydi · Istisno yuqorida</p>
        </div>
        {hasRole(["marketing", "admin"]) && (
          <Button asChild><Link to="/orders/new"><Plus className="h-4 w-4 mr-2" />Yangi zakaz</Link></Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
              <TabsList>
                <TabsTrigger value="all">Barchasi</TabsTrigger>
                <TabsTrigger value="active">Aktiv</TabsTrigger>
                <TabsTrigger value="exception">Istisno</TabsTrigger>
                <TabsTrigger value="delayed">Kechikkan</TabsTrigger>
                <TabsTrigger value="completed">Tugallangan</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8 w-64" placeholder="Qidirish..." value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Raqam</TableHead>
                  <TableHead>Klient</TableHead>
                  <TableHead>Mahsulot</TableHead>
                  <TableHead className="text-right">Soni</TableHead>
                  <TableHead>Muhimlik</TableHead>
                  <TableHead>Holat</TableHead>
                  <TableHead>Olingan</TableHead>
                  <TableHead>Boshlanish</TableHead>
                  <TableHead>Tugash</TableHead>
                  <TableHead>Qoldi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-8">Yuklanmoqda...</TableCell></TableRow>}
                {!loading && filtered.map((o) => {
                  const today0 = new Date(); today0.setHours(0,0,0,0);
                  const dl = new Date(o.deadline); dl.setHours(0,0,0,0);
                  const diffDays = Math.ceil((dl.getTime() - today0.getTime()) / 86400000);
                  const isDone = o.status === "completed";
                  const stages = ((o as any).order_stages ?? []).slice().sort((a:any,b:any)=>a.stage_order-b.stage_order);
                  const startedAt = stages[0]?.started_at;
                  const startStr = startedAt ? new Date(startedAt).toISOString().slice(0,10) : "—";
                  return (
                    <TableRow key={o.id} className="cursor-pointer" onClick={() => window.location.assign(`/orders/${o.id}`)}>
                      <TableCell><HealthDot color={orderHealth(o)} /></TableCell>
                      <TableCell className="font-mono text-sm">{o.order_number}</TableCell>
                      <TableCell className="text-sm">{(o as any).client?.name ?? "—"}</TableCell>
                      <TableCell className="text-sm font-medium">{o.product_name}</TableCell>
                      <TableCell className="text-right text-sm">{o.quantity}</TableCell>
                      <TableCell><PriorityBadge priority={o.priority} /></TableCell>
                      <TableCell><StatusBadge status={o.status as any} /></TableCell>
                      <TableCell className="text-sm whitespace-nowrap">{o.order_date}</TableCell>
                      <TableCell className="text-sm whitespace-nowrap text-muted-foreground">{startStr}</TableCell>
                      <TableCell className="text-sm whitespace-nowrap">{o.deadline}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {isDone ? <span className="text-status-green font-medium">Tugadi</span>
                          : diffDays < 0 ? <span className="text-status-red font-semibold">{Math.abs(diffDays)} kun kechikdi</span>
                          : diffDays === 0 ? <span className="text-status-yellow font-semibold">Bugun</span>
                          : <span className={diffDays <= 2 ? "text-status-yellow font-semibold" : "text-status-green font-medium"}>{diffDays} kun qoldi</span>}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!loading && filtered.length === 0 && <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-8">Zakaz yo'q</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
