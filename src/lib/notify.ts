import { supabase } from "@/integrations/supabase/client";

export type NotifType =
  | "otk_approved" | "otk_rejected"
  | "stage_started" | "stage_finished"
  | "order_completed" | "order_created"
  | "low_stock" | "instrument_overdue"
  | "supply_request" | "supply_fulfilled"
  | "service_request"
  | "info";

// Default role routing when caller doesn't specify recipient_id/recipient_role.
// Admin implicitly sees everything (client-side filter).
const DEFAULT_ROLES: Record<NotifType, string[]> = {
  otk_approved:       ["marketing", "manager"],
  otk_rejected:       ["marketing", "manager"],
  stage_started:      ["manager"],
  stage_finished:     ["manager"],
  order_completed:    ["marketing", "manager"],
  order_created:      ["manager", "warehouse", "supply", "engineer", "otk"],
  low_stock:          ["warehouse", "supply"],
  instrument_overdue: ["manager", "warehouse"],
  supply_request:     ["supply", "warehouse"],
  supply_fulfilled:   ["warehouse", "manager"],
  service_request:    ["manager"],
  info:               [],
};

export interface NotifyInput {
  type: NotifType;
  title: string;
  body?: string;
  link?: string;
  entity?: string;
  entity_id?: string;
  /** Deliver to a specific user (highest priority). */
  recipient_id?: string | null;
  /** Deliver to one or more roles. Overrides the default type→roles map. */
  recipient_role?: string | string[] | null;
  sender_id?: string | null;
  sender_name?: string | null;
}

/** Insert one or more notification rows and let realtime deliver them. */
export async function notify(n: NotifyInput): Promise<void> {
  try {
    const base = {
      type: n.type,
      title: n.title,
      body: n.body ?? null,
      link: n.link ?? null,
      entity: n.entity ?? null,
      entity_id: n.entity_id ?? null,
      sender_id: n.sender_id ?? null,
      sender_name: n.sender_name ?? null,
    };

    // Direct-to-user always wins.
    if (n.recipient_id) {
      await supabase.from("notifications").insert({ ...base, recipient_id: n.recipient_id } as any);
      return;
    }

    // Explicit role targeting, else fall back to type default.
    const roles = (Array.isArray(n.recipient_role)
      ? n.recipient_role
      : n.recipient_role
        ? [n.recipient_role]
        : DEFAULT_ROLES[n.type] ?? []) as string[];

    if (roles.length === 0) {
      // Truly global broadcast — only admins will see it (client-side filter).
      await supabase.from("notifications").insert({ ...base, recipient_role: null } as any);
      return;
    }

    const rows = roles.map((r) => ({ ...base, recipient_role: r }));
    await supabase.from("notifications").insert(rows as any);
  } catch (e) {
    // Notifications must never block the originating action.
    console.warn("notify() failed", e);
  }
}
