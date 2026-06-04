import { supabase } from "@/integrations/supabase/client";

export type NotifType =
  | "otk_approved" | "otk_rejected"
  | "stage_started" | "stage_finished"
  | "order_completed" | "order_created"
  | "low_stock" | "instrument_overdue"
  | "info";

export interface NotifyInput {
  type: NotifType;
  title: string;
  body?: string;
  link?: string;
  entity?: string;
  entity_id?: string;
  /** Omit for broadcast (visible to everyone). */
  recipient_id?: string | null;
  sender_id?: string | null;
  sender_name?: string | null;
}

/** Insert a notification row. Realtime delivers it to the bell. */
export async function notify(n: NotifyInput): Promise<void> {
  try {
    await supabase.from("notifications").insert({
      type: n.type,
      title: n.title,
      body: n.body ?? null,
      link: n.link ?? null,
      entity: n.entity ?? null,
      entity_id: n.entity_id ?? null,
      recipient_id: n.recipient_id ?? null,
      sender_id: n.sender_id ?? null,
      sender_name: n.sender_name ?? null,
    } as any);
  } catch (e) {
    // Notifications must never block the originating action.
    console.warn("notify() failed", e);
  }
}
