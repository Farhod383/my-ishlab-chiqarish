import {
  ClipboardList, Factory, ShieldCheck, Warehouse, Truck, RotateCcw, AlertOctagon,
  Users, ScanFace, Wallet, MessageSquare, FileBarChart, History, Wrench, Contact, Bell,
} from "lucide-react";

export type NotifModuleKey =
  | "orders" | "production" | "otk" | "warehouse" | "supply" | "returns" | "defects"
  | "hr" | "faceid" | "kassa" | "chat" | "reports" | "audit" | "service" | "clients" | "other";

export interface NotifModule {
  key: NotifModuleKey;
  label: string;
  icon: any;
  /** Sidebar route this module maps to (for badges). */
  url?: string;
  /** Fallback route when a notification has no link. */
  fallbackLink?: string;
}

export const NOTIF_MODULES: NotifModule[] = [
  { key: "orders",     label: "Zakazlar",            icon: ClipboardList, url: "/orders",     fallbackLink: "/orders" },
  { key: "production", label: "Ishlab chiqarish",    icon: Factory,       url: "/production", fallbackLink: "/production" },
  { key: "otk",        label: "OTK (Sifat nazorati)",icon: ShieldCheck,   url: "/otk",        fallbackLink: "/otk" },
  { key: "warehouse",  label: "Sklad (Ombor)",       icon: Warehouse,     url: "/warehouse",  fallbackLink: "/warehouse" },
  { key: "supply",     label: "Ta'minot",            icon: Truck,         url: "/supply",     fallbackLink: "/supply" },
  { key: "returns",    label: "Vozvrat",             icon: RotateCcw,     url: "/returns",    fallbackLink: "/returns" },
  { key: "defects",    label: "Brak",                icon: AlertOctagon,  url: "/defects",    fallbackLink: "/defects" },
  { key: "hr",         label: "Xodimlar (HR)",       icon: Users,         url: "/hr",         fallbackLink: "/hr" },
  { key: "faceid",     label: "Face_id (Davomat)",   icon: ScanFace,      url: "/face-id",    fallbackLink: "/face-id" },
  { key: "kassa",      label: "Kassa (Moliya)",      icon: Wallet,        url: "/kassa",      fallbackLink: "/kassa" },
  { key: "service",    label: "Remont (Servis)",     icon: Wrench,        url: "/service",    fallbackLink: "/service" },
  { key: "clients",    label: "Klientlar (CRM)",     icon: Contact,       url: "/clients",    fallbackLink: "/clients" },
  { key: "chat",       label: "Suhbatlar",           icon: MessageSquare, url: "/chat",       fallbackLink: "/chat" },
  { key: "reports",    label: "Hisobot",             icon: FileBarChart,  url: "/reports",    fallbackLink: "/reports" },
  { key: "audit",      label: "Audit log",           icon: History,       url: "/audit",      fallbackLink: "/audit" },
  { key: "other",      label: "Boshqalar",           icon: Bell },
];

export const MODULE_BY_KEY: Record<NotifModuleKey, NotifModule> = Object.fromEntries(
  NOTIF_MODULES.map((m) => [m.key, m]),
) as Record<NotifModuleKey, NotifModule>;

/** Sidebar url → module key (for per-section badges). */
export const MODULE_BY_URL: Record<string, NotifModuleKey> = Object.fromEntries(
  NOTIF_MODULES.filter((m) => m.url).map((m) => [m.url as string, m.key]),
);

const BY_ENTITY: Record<string, NotifModuleKey> = {
  supply_request: "supply",
  stock_movement: "warehouse",
  product: "warehouse",
  instrument: "warehouse",
  return: "returns",
  defect: "defects",
  employee: "hr",
  vacancy: "hr",
  attendance: "faceid",
  face_event: "faceid",
  cash_income: "kassa",
  cash_expense: "kassa",
  chat_message: "chat",
  service_request: "service",
  client: "clients",
  order: "orders",
  stage: "production",
};

const BY_TYPE: Record<string, NotifModuleKey> = {
  otk_approved: "otk",
  otk_rejected: "otk",
  stage_started: "production",
  stage_finished: "production",
  order_created: "orders",
  order_completed: "orders",
  low_stock: "warehouse",
  instrument_overdue: "warehouse",
  supply_request: "supply",
  supply_fulfilled: "supply",
  service_request: "service",
};

const BY_LINK: Array<[string, NotifModuleKey]> = [
  ["/supply", "supply"],
  ["/warehouse", "warehouse"],
  ["/low-stock", "warehouse"],
  ["/returns", "returns"],
  ["/defects", "defects"],
  ["/hr", "hr"],
  ["/face-id", "faceid"],
  ["/kassa", "kassa"],
  ["/chat", "chat"],
  ["/service", "service"],
  ["/reports", "reports"],
  ["/audit", "audit"],
  ["/clients", "clients"],
  ["/production", "production"],
  ["/nachalnik", "production"],
  ["/otk", "otk"],
  ["/orders", "orders"],
];

export interface ModuleResolvable {
  type?: string | null;
  entity?: string | null;
  link?: string | null;
}

/** Decide which module a notification belongs to. */
export function resolveModule(n: ModuleResolvable): NotifModuleKey {
  if (n.type && BY_TYPE[n.type]) return BY_TYPE[n.type];
  if (n.entity && BY_ENTITY[n.entity]) return BY_ENTITY[n.entity];
  if (n.link) {
    const hit = BY_LINK.find(([prefix]) => n.link!.startsWith(prefix));
    if (hit) return hit[1];
  }
  return "other";
}

/** Where clicking a notification should navigate. */
export function resolveLink(n: ModuleResolvable & { entity_id?: string | null }): string | null {
  if (n.link) return n.link;
  const mod = MODULE_BY_KEY[resolveModule(n)];
  return mod?.fallbackLink ?? null;
}
