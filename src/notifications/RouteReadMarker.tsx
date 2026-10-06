import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useNotifications } from "./NotificationsContext";

/**
 * System-wide rule: opening the page a notification points to marks it read.
 * Uses the shared notification service (markIds via markRead), so bell, list and
 * page visits share one read-state. Item-level entities (stage, supply_request)
 * are marked when their exact item is opened inside the page.
 */
const ITEM_LEVEL = new Set(["stage", "supply_request"]);

export function RouteReadMarker() {
  const { pathname } = useLocation();
  const { items, markRead } = useNotifications();

  useEffect(() => {
    const path = pathname.replace(/\/+$/, "") || "/";
    const unread = items.filter((n) => {
      if (n.read_at || !n.link || ITEM_LEVEL.has(n.entity ?? "")) return false;
      const link = n.link.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
      return link === path;
    });
    if (!unread.length) return;
    const t = window.setTimeout(() => { unread.forEach((n) => { void markRead(n); }); }, 800);
    return () => window.clearTimeout(t);
  }, [pathname, items, markRead]);

  return null;
}
