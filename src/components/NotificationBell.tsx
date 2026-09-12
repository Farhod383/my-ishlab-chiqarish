import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { Bell, BellRing, CheckCheck, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useNotifications, type Notif } from "@/notifications/NotificationsContext";
import { NOTIF_MODULES, MODULE_BY_KEY, resolveModule, resolveLink, type NotifModuleKey } from "@/lib/notifModules";
import { fmtTime24, fmtDateTime24, fmtLegacyDurations } from "@/lib/format";

const TYPE_DOT: Record<string, string> = {
  otk_approved: "bg-status-green",
  otk_rejected: "bg-status-red",
  stage_started: "bg-status-blue",
  stage_finished: "bg-status-green",
  order_completed: "bg-status-green",
  order_created: "bg-primary",
  low_stock: "bg-status-yellow",
  instrument_overdue: "bg-status-red",
  supply_request: "bg-status-red",
  supply_fulfilled: "bg-status-green",
  info: "bg-muted-foreground",
};

const fmtTime = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay ? fmtTime24(iso) : fmtDateTime24(iso);
};

export function NotificationBell() {
  const { user } = useAuth();
  const nav = useNavigate();
  const { items, unreadTotal, unreadByModule, markRead, markAll, markModuleRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<NotifModuleKey | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<NotifModuleKey, Notif[]>();
    for (const n of items) {
      const k = resolveModule(n);
      const arr = map.get(k) ?? [];
      arr.push(n);
      map.set(k, arr);
    }
    return NOTIF_MODULES
      .map((m) => ({ mod: m, list: map.get(m.key) ?? [] }))
      .filter((g) => g.list.length > 0)
      .sort((a, b) => {
        const ua = unreadByModule[a.mod.key] ?? 0;
        const ub = unreadByModule[b.mod.key] ?? 0;
        if (ua !== ub) return ub - ua;
        return new Date(b.list[0].created_at).getTime() - new Date(a.list[0].created_at).getTime();
      });
  }, [items, unreadByModule]);

  const activeList = useMemo(
    () => (active ? items.filter((n) => resolveModule(n) === active) : []),
    [items, active],
  );

  useEffect(() => {
    if (!open || !active) return;
    const unread = activeList.filter((n) => !n.read_at);
    if (unread.length === 0) return;
    const frame = window.requestAnimationFrame(() => { void markModuleRead(active); });
    return () => window.cancelAnimationFrame(frame);
  }, [open, active, activeList, markModuleRead]);

  const openOne = async (n: Notif) => {
    await markRead(n);
    setOpen(false);
    const link = resolveLink(n);
    if (link) nav(link);
  };

  if (!user) return null;

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setActive(null); }}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Bildirishnomalar"
          className="relative h-14 w-14 rounded-full [&_svg]:!size-9"
        >
          {unreadTotal > 0 ? (
            <BellRing className="animate-bell-shake origin-top text-primary" strokeWidth={2.2} />
          ) : (
            <Bell strokeWidth={2.2} />
          )}
          {unreadTotal > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-7 min-w-[1.75rem] px-2 text-sm font-bold flex items-center justify-center rounded-full ring-2 ring-background shadow-lg"
            >
              {unreadTotal > 99 ? "99+" : unreadTotal}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[min(96vw,26rem)] p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b gap-2">
          {active ? (
            <button onClick={() => setActive(null)} className="flex items-center gap-1 text-sm font-semibold min-w-0">
              <ChevronLeft className="h-4 w-4 shrink-0" />
              <span className="truncate">{MODULE_BY_KEY[active].label}</span>
            </button>
          ) : (
            <div className="text-sm font-semibold">Bildirishnomalar</div>
          )}
          {(active ? (unreadByModule[active] ?? 0) > 0 : unreadTotal > 0) && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => (active ? markModuleRead(active) : markAll())}
              className="h-7 text-xs shrink-0"
            >
              <CheckCheck className="h-3 w-3 mr-1" /> O'qildi
            </Button>
          )}
        </div>

        <ScrollArea className="h-[min(70vh,460px)]">
          {!active && grouped.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-8">Bildirishnomalar yo'q</div>
          )}

          {!active &&
            grouped.map(({ mod, list }) => {
              const unread = unreadByModule[mod.key] ?? 0;
              const last = list[0];
              const Icon = mod.icon;
              return (
                <button
                  key={mod.key}
                  onClick={() => setActive(mod.key)}
                  className={`w-full text-left px-3 py-2.5 border-b last:border-b-0 hover:bg-muted/50 transition-colors flex gap-3 items-center ${unread ? "bg-primary/5" : ""}`}
                >
                  <span className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <Icon className="h-5 w-5 text-foreground/80" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className={`text-sm truncate flex-1 ${unread ? "font-bold" : "font-semibold"}`}>{mod.label}</div>
                      <span className="text-[11px] text-muted-foreground shrink-0">{fmtTime(last.created_at)}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <div className="text-xs text-muted-foreground truncate flex-1">{last.title}</div>
                      {unread > 0 && (
                        <Badge variant="destructive" className="h-5 min-w-[1.25rem] px-1.5 text-[11px] rounded-full shrink-0">
                          {unread > 99 ? "99+" : unread}
                        </Badge>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}

          {active &&
            activeList.map((n) => (
              <button
                key={n.id}
                onClick={() => openOne(n)}
                className={`w-full text-left px-3 py-2 border-b last:border-b-0 hover:bg-muted/50 transition-colors flex gap-3 ${n.read_at ? "" : "bg-primary/5"}`}
              >
                <span className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${TYPE_DOT[n.type] ?? "bg-muted-foreground"}`} />
                <div className="min-w-0 flex-1">
                  <div className={`text-sm truncate ${n.read_at ? "font-medium" : "font-semibold"}`}>{n.title}</div>
                  {n.body && <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{fmtLegacyDurations(n.body)}</div>}
                  <div className="text-[11px] text-muted-foreground/80 mt-1.5 flex flex-wrap items-center gap-x-2">
                    <span>{fmtTime(n.created_at)}</span>
                    {n.sender_name && <span>· {n.sender_name}</span>}
                  </div>
                </div>
              </button>
            ))}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
