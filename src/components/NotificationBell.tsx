import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { AppRole } from "@/auth/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthContext";
import { Bell, BellRing, Check, CheckCheck } from "lucide-react";
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
  recipient_role: string | null;
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
  const { user, roles } = useAuth();
  const isAdmin = roles.includes("admin" as AppRole);
  const myRoles = roles as string[];
  const nav = useNavigate();
  const [items, setItems] = useState<Notif[]>([]);
  const [open, setOpen] = useState(false);
  const askedRef = useRef(false);

  // Does this notification belong in my bell?
  const belongsToMe = (n: Notif): boolean => {
    if (isAdmin) return true;
    if (n.recipient_id && n.recipient_id === user?.id) return true;
    if (n.recipient_role && myRoles.includes(n.recipient_role)) return true;
    // Fully broadcast (no user, no role) → only admins.
    return false;
  };

  const load = async () => {
    if (!user) return;
    let query = supabase.from("notifications").select("*");
    if (!isAdmin) {
      const roleList = myRoles.map((r) => `"${r}"`).join(",");
      const orParts = [`recipient_id.eq.${user.id}`];
      if (myRoles.length) orParts.push(`recipient_role.in.(${roleList})`);
      query = query.or(orParts.join(","));
    }
    const { data } = await query.order("created_at", { ascending: false }).limit(50);
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
        if (!belongsToMe(n)) return;
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
  }, [user?.id, isAdmin, myRoles.join(",")]);

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
        <Button variant="ghost" size="icon" className="relative h-12 w-12">
          {unread > 0 ? (
            <BellRing className="h-9 w-9 animate-bell-shake origin-top text-primary" strokeWidth={2.2} />
          ) : (
            <Bell className="h-9 w-9" strokeWidth={2.2} />
          )}
          {unread > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-7 min-w-7 px-1.5 text-[13px] font-bold flex items-center justify-center rounded-full ring-2 ring-background shadow-md"
            >
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
                <div className="text-sm font-semibold truncate">{n.title}</div>
                {n.body && <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.body}</div>}
                <div className="text-[11px] text-muted-foreground mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
                  <span className="font-medium text-foreground/70">{new Date(n.created_at).toLocaleDateString()} {new Date(n.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  {n.sender_name && <span>· {n.sender_name}</span>}
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
