import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthContext";
import { Bell, Check, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface Notif {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  entity: string | null;
  entity_id: string | null;
  recipient_id: string | null;
  sender_name: string | null;
  read_at: string | null;
  created_at: string;
}

const TYPE_DOT: Record<string, string> = {
  otk_approved: "bg-status-green",
  otk_rejected: "bg-status-red",
  stage_started: "bg-status-blue",
  stage_finished: "bg-status-green",
  order_completed: "bg-status-green",
  order_created: "bg-primary",
  low_stock: "bg-status-yellow",
  instrument_overdue: "bg-status-red",
  info: "bg-muted-foreground",
};

export function NotificationBell() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [items, setItems] = useState<Notif[]>([]);
  const [open, setOpen] = useState(false);
  const askedRef = useRef(false);

  const load = async () => {
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .or(`recipient_id.is.null,recipient_id.eq.${user?.id ?? "00000000-0000-0000-0000-000000000000"}`)
      .order("created_at", { ascending: false })
      .limit(50);
    setItems((data as any) ?? []);
  };

  useEffect(() => {
    if (!user) return;
    load();

    // Ask for browser-notification permission once per session.
    if (!askedRef.current && typeof Notification !== "undefined" && Notification.permission === "default") {
      askedRef.current = true;
      Notification.requestPermission().catch(() => {});
    }

    const ch = supabase
      .channel("notifications-bell")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, (payload) => {
        const n = payload.new as Notif;
        // Only react to broadcasts or those for me.
        if (n.recipient_id && n.recipient_id !== user.id) return;
        setItems((prev) => [n, ...prev].slice(0, 50));
        toast(n.title, { description: n.body ?? undefined });
        if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.hidden) {
          try {
            const native = new Notification(`MCITY ERP — ${n.title}`, { body: n.body ?? "", tag: n.id });
            native.onclick = () => { window.focus(); if (n.link) nav(n.link); };
          } catch {}
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  const unread = items.filter((n) => !n.read_at).length;

  const markRead = async (n: Notif) => {
    if (!n.read_at) {
      await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id);
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
    }
  };

  const markAll = async () => {
    const ids = items.filter((n) => !n.read_at).map((n) => n.id);
    if (!ids.length) return;
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).in("id", ids);
    setItems((prev) => prev.map((x) => (x.read_at ? x : { ...x, read_at: new Date().toISOString() })));
  };

  const openOne = (n: Notif) => {
    markRead(n);
    setOpen(false);
    if (n.link) nav(n.link);
  };

  if (!user) return null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <Badge variant="destructive" className="absolute -top-1 -right-1 h-5 min-w-5 px-1 text-[10px] flex items-center justify-center rounded-full">
              {unread > 99 ? "99+" : unread}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <div className="text-sm font-semibold">Bildirishnomalar</div>
          {unread > 0 && (
            <Button size="sm" variant="ghost" onClick={markAll} className="h-7 text-xs">
              <CheckCheck className="h-3 w-3 mr-1" /> Barchasini o'qildi
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-[420px]">
          {items.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-8">Bildirishnomalar yo'q</div>
          )}
          {items.map((n) => (
            <button
              key={n.id}
              onClick={() => openOne(n)}
              className={`w-full text-left px-3 py-2 border-b last:border-b-0 hover:bg-muted/50 transition-colors flex gap-3 ${n.read_at ? "" : "bg-primary/5"}`}
            >
              <span className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${TYPE_DOT[n.type] ?? "bg-muted-foreground"}`} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{n.title}</div>
                {n.body && <div className="text-xs text-muted-foreground line-clamp-2">{n.body}</div>}
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {new Date(n.created_at).toLocaleString()}
                  {n.sender_name && ` · ${n.sender_name}`}
                </div>
              </div>
              {!n.read_at && <Check className="h-3 w-3 text-primary mt-1 shrink-0 opacity-60" />}
            </button>
          ))}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
