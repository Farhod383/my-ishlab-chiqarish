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
  recipient_roles?: string[] | null;
  sender_name: string | null;
  read_at: string | null;
  created_at: string;
}

/** Extract the order id a notification belongs to (link `/orders/<id>` or entity `order`). */
export function notifOrderId(n: Notif): string | null {
  const m = (n.link ?? "").match(/\/orders\/([0-9a-fA-F-]{36})/);
  if (m) return m[1];
  if (n.entity === "order" && n.entity_id) return n.entity_id;
  return null;
}

/** Extract the production stage id a notification belongs to (entity `stage`). */
export function notifStageId(n: Notif): string | null {
  return n.entity === "stage" && n.entity_id ? n.entity_id : null;
}

interface Ctx {
  items: Notif[];
  loading: boolean;
  unreadTotal: number;
  unreadByModule: Record<string, number>;
  unreadByUrl: Record<string, number>;
  /** Unread count per order id — each order counts only its own updates. */
  unreadByOrder: Record<string, number>;
  /** Unread count per production stage id. */
  unreadByStage: Record<string, number>;
  markOrderRead: (orderId: string) => Promise<void>;
  markStageRead: (stageId: string) => Promise<void>;
  markRead: (n: Notif) => Promise<void>;
  markModuleRead: (key: NotifModuleKey) => Promise<void>;
  markAll: () => Promise<void>;
  refresh: () => Promise<void>;
}

const NotificationsContext = createContext<Ctx | null>(null);

export function useNotifications(): Ctx {
  return (
    useContext(NotificationsContext) ?? {
      items: [], loading: false, unreadTotal: 0, unreadByModule: {}, unreadByUrl: {}, unreadByOrder: {}, unreadByStage: {},
      markOrderRead: async () => {}, markStageRead: async () => {}, markRead: async () => {}, markModuleRead: async () => {}, markAll: async () => {}, refresh: async () => {},
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
  const refreshTimerRef = useRef<number | null>(null);
  /** Representative notification id → every duplicate row id of the same event. */
  const groupsRef = useRef<Record<string, string[]>>({});

  const belongsToMe = useCallback(
    (n: Notif) => {
      if (seesAll) return true;
      if (n.recipient_id && n.recipient_id === user?.id) return true;
      if (n.recipient_role && myRoles.includes(n.recipient_role)) return true;
      if (n.recipient_roles?.some((r) => myRoles.includes(r))) return true;
      return false;
    },
    [seesAll, user?.id, myRoles.join(",")],
  );

  const refresh = useCallback(async () => {
    if (!user) { setItems([]); return; }
    setLoading(true);
    const loaded: Notif[] = [];
    const pageSize = 1000;
    let from = 0;
    let failed = false;

    while (true) {
      const { data, error } = await supabase
        .from("notification_user_states")
        .select("notification_id,is_read,read_at,created_at,notifications(*)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .range(from, from + pageSize - 1);

      if (error) {
        console.warn("Bildirishnomalarni yuklashda xato", error);
        failed = true;
        break;
      }

      const rows = (data ?? []) as any[];
      for (const row of rows) {
        const notification = Array.isArray(row.notifications) ? row.notifications[0] : row.notifications;
        if (!notification) continue;
        loaded.push({
          ...notification,
          read_at: row.is_read ? (row.read_at ?? row.created_at) : null,
        } as Notif);
      }

      if (rows.length < pageSize) break;
      from += pageSize;
    }

    if (!failed) {
      // Legacy rows fanned out one-per-role produce several identical entries for
      // the same event. Show each event once, but remember every underlying id so
      // marking it read clears the whole group (and it never flips back to unread).
      const groups: Record<string, string[]> = {};
      const byKey = new Map<string, Notif>();
      for (const n of loaded) {
        const key = [n.type, n.title, n.body ?? "", n.entity ?? "", n.entity_id ?? "", n.link ?? "", n.created_at].join("|");
        const head = byKey.get(key);
        if (!head) {
          byKey.set(key, { ...n });
          groups[n.id] = [n.id];
        } else {
          groups[head.id].push(n.id);
          if (n.read_at && !head.read_at) head.read_at = n.read_at;
        }
      }
      groupsRef.current = groups;
      setItems(Array.from(byKey.values()));
    }
    setLoading(false);
  }, [user?.id]);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null;
      void refresh();
    }, 100);
  }, [refresh]);

  useEffect(() => {
    if (!user) { setItems([]); return; }
    refresh();

    if (!askedRef.current && typeof Notification !== "undefined" && Notification.permission === "default") {
      askedRef.current = true;
      Notification.requestPermission().catch(() => {});
    }

    const notificationsChannel = supabase
      .channel("notifications-center")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, (payload) => {
        const n = payload.new as Notif;
        if (!belongsToMe(n)) return;
        toast(n.title, { description: n.body ?? undefined });
        if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.hidden) {
          try { new Notification(`MCITY ERP — ${n.title}`, { body: n.body ?? "", tag: n.id }); } catch {}
        }
        // Badge must update without a page refresh even if the state row event is missed.
        scheduleRefresh();
      })
      .subscribe();

    const statesChannel = supabase
      .channel(`notification-user-states-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notification_user_states", filter: `user_id=eq.${user.id}` },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notification_user_states", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const state = payload.new as { notification_id: string; is_read: boolean; read_at: string | null };
          if (!state.is_read) return; // never flip an already-read entry back to unread
          const groups = groupsRef.current;
          const headId = Object.keys(groups).find((id) => groups[id].includes(state.notification_id)) ?? state.notification_id;
          setItems((prev) => prev.map((item) => item.id === headId && !item.read_at
            ? { ...item, read_at: state.read_at ?? new Date().toISOString() }
            : item));
        },
      )
      .subscribe();

    // Safety net if the socket drops.
    const poll = window.setInterval(() => { if (!document.hidden) refresh(); }, 60_000);
    const onVisible = () => { if (!document.hidden) refresh(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      supabase.removeChannel(notificationsChannel);
      supabase.removeChannel(statesChannel);
      window.clearInterval(poll);
      if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user?.id, seesAll, myRoles.join(","), belongsToMe, refresh, scheduleRefresh]);

  const markIds = async (ids: string[]) => {
    if (!ids.length || !user) return;
    const now = new Date().toISOString();
    setItems((prev) => prev.map((x) => (ids.includes(x.id) && !x.read_at ? { ...x, read_at: now } : x)));
    // Expand to every duplicate row of the same event so it stays read.
    const all = Array.from(new Set(ids.flatMap((id) => groupsRef.current[id] ?? [id])));
    for (let start = 0; start < all.length; start += 200) {
      const batch = all.slice(start, start + 200);
      const { error } = await supabase
        .from("notification_user_states")
        .update({ is_read: true, read_at: now })
        .eq("user_id", user.id)
        .in("notification_id", batch)
        .eq("is_read", false);
      if (error) {
        console.warn("Bildirishnomani o'qilgan deb belgilashda xato", error);
        await refresh();
        return;
      }
    }
  };

  const markRead = async (n: Notif) => { if (!n.read_at) await markIds([n.id]); };

  const markModuleRead = async (key: NotifModuleKey) =>
    markIds(items.filter((n) => !n.read_at && resolveModule(n) === key).map((n) => n.id));

  const markAll = async () => markIds(items.filter((n) => !n.read_at).map((n) => n.id));

  const markOrderRead = async (orderId: string) =>
    markIds(items.filter((n) => !n.read_at && notifOrderId(n) === orderId).map((n) => n.id));

  const markStageRead = async (stageId: string) =>
    markIds(items.filter((n) => !n.read_at && notifStageId(n) === stageId).map((n) => n.id));

  const { unreadByModule, unreadByUrl, unreadTotal, unreadByOrder, unreadByStage } = useMemo(() => {
    const byModule: Record<string, number> = {};
    const byOrder: Record<string, number> = {};
    const byStage: Record<string, number> = {};
    let total = 0;
    for (const n of items) {
      if (n.read_at) continue;
      total++;
      const k = resolveModule(n);
      byModule[k] = (byModule[k] ?? 0) + 1;
      const oid = notifOrderId(n);
      if (oid) byOrder[oid] = (byOrder[oid] ?? 0) + 1;
      const sid = notifStageId(n);
      if (sid) byStage[sid] = (byStage[sid] ?? 0) + 1;
    }
    const byUrl: Record<string, number> = {};
    for (const [k, count] of Object.entries(byModule)) {
      const url = MODULE_BY_KEY[k as NotifModuleKey]?.url;
      if (url) byUrl[url] = (byUrl[url] ?? 0) + count;
    }
    return { unreadByModule: byModule, unreadByUrl: byUrl, unreadTotal: total, unreadByOrder: byOrder, unreadByStage: byStage };
  }, [items]);

  const value: Ctx = {
    items, loading, unreadTotal, unreadByModule, unreadByUrl, unreadByOrder, unreadByStage,
    markOrderRead, markStageRead, markRead, markModuleRead, markAll, refresh,
  };

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}
