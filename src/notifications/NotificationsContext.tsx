import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthContext";
import { resolveModule, type NotifModuleKey } from "@/lib/notifModules";
import { toast } from "sonner";

export interface Notif {
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

interface Ctx {
  items: Notif[];
  loading: boolean;
  unreadTotal: number;
  unreadByModule: Record<string, number>;
  unreadByUrl: Record<string, number>;
  markRead: (n: Notif) => Promise<void>;
  markModuleRead: (key: NotifModuleKey) => Promise<void>;
  markAll: () => Promise<void>;
  refresh: () => Promise<void>;
}

const NotificationsContext = createContext<Ctx | null>(null);

export function useNotifications(): Ctx {
  return (
    useContext(NotificationsContext) ?? {
      items: [], loading: false, unreadTotal: 0, unreadByModule: {}, unreadByUrl: {},
      markRead: async () => {}, markModuleRead: async () => {}, markAll: async () => {}, refresh: async () => {},
    }
  );
}

import { MODULE_BY_KEY } from "@/lib/notifModules";

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { user, roles } = useAuth();
  const myRoles = roles as string[];
  // Admin and Nachalnik (manager) get the full picture.
  const seesAll = myRoles.includes("admin") || myRoles.includes("manager");
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(false);
  const askedRef = useRef(false);

  const belongsToMe = useCallback(
    (n: Notif) => {
      if (seesAll) return true;
      if (n.recipient_id && n.recipient_id === user?.id) return true;
      if (n.recipient_role && myRoles.includes(n.recipient_role)) return true;
      return false;
    },
    [seesAll, user?.id, myRoles.join(",")],
  );

  const refresh = useCallback(async () => {
    if (!user) { setItems([]); return; }
    setLoading(true);
    let query = supabase.from("notifications").select("*");
    if (!seesAll) {
      const roleList = myRoles.map((r) => `"${r}"`).join(",");
      const orParts = [`recipient_id.eq.${user.id}`];
      if (myRoles.length) orParts.push(`recipient_role.in.(${roleList})`);
      query = query.or(orParts.join(","));
    }
    const { data } = await query.order("created_at", { ascending: false }).limit(300);
    setItems(((data as any) ?? []) as Notif[]);
    setLoading(false);
  }, [user?.id, seesAll, myRoles.join(",")]);

  useEffect(() => {
    if (!user) { setItems([]); return; }
    refresh();

    if (!askedRef.current && typeof Notification !== "undefined" && Notification.permission === "default") {
      askedRef.current = true;
      Notification.requestPermission().catch(() => {});
    }

    const ch = supabase
      .channel("notifications-center")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, (payload) => {
        const n = payload.new as Notif;
        if (!belongsToMe(n)) return;
        setItems((prev) => (prev.some((x) => x.id === n.id) ? prev : [n, ...prev].slice(0, 300)));
        toast(n.title, { description: n.body ?? undefined });
        if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.hidden) {
          try { new Notification(`MCITY ERP — ${n.title}`, { body: n.body ?? "", tag: n.id }); } catch {}
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications" }, (payload) => {
        const n = payload.new as Notif;
        setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, ...n } : x)));
      })
      .subscribe();

    // Safety net if the socket drops.
    const poll = window.setInterval(() => { if (!document.hidden) refresh(); }, 60_000);
    const onVisible = () => { if (!document.hidden) refresh(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      supabase.removeChannel(ch);
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user?.id, seesAll, myRoles.join(",")]);

  const markIds = async (ids: string[]) => {
    if (!ids.length) return;
    const now = new Date().toISOString();
    setItems((prev) => prev.map((x) => (ids.includes(x.id) && !x.read_at ? { ...x, read_at: now } : x)));
    await supabase.from("notifications").update({ read_at: now }).in("id", ids);
  };

  const markRead = async (n: Notif) => { if (!n.read_at) await markIds([n.id]); };

  const markModuleRead = async (key: NotifModuleKey) =>
    markIds(items.filter((n) => !n.read_at && resolveModule(n) === key).map((n) => n.id));

  const markAll = async () => markIds(items.filter((n) => !n.read_at).map((n) => n.id));

  const { unreadByModule, unreadByUrl, unreadTotal } = useMemo(() => {
    const byModule: Record<string, number> = {};
    let total = 0;
    for (const n of items) {
      if (n.read_at) continue;
      total++;
      const k = resolveModule(n);
      byModule[k] = (byModule[k] ?? 0) + 1;
    }
    const byUrl: Record<string, number> = {};
    for (const [k, count] of Object.entries(byModule)) {
      const url = MODULE_BY_KEY[k as NotifModuleKey]?.url;
      if (url) byUrl[url] = (byUrl[url] ?? 0) + count;
    }
    return { unreadByModule: byModule, unreadByUrl: byUrl, unreadTotal: total };
  }, [items]);

  const value: Ctx = {
    items, loading, unreadTotal, unreadByModule, unreadByUrl,
    markRead, markModuleRead, markAll, refresh,
  };

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}
