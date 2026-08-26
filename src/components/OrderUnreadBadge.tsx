import { useNotifications } from "@/notifications/NotificationsContext";
import { cn } from "@/lib/utils";

/** Compact red badge with the unread notification count of a single order. */
export function OrderUnreadBadge({ orderId, className }: { orderId: string; className?: string }) {
  const { unreadByOrder } = useNotifications();
  const count = unreadByOrder[orderId] ?? 0;
  if (!count) return null;
  return (
    <span
      title={`${count} ta yangi o'zgarish`}
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-status-red px-1.5 text-[11px] font-bold leading-none text-status-red-foreground shadow-sm",
        className,
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
