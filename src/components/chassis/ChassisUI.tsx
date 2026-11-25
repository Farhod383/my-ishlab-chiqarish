import { NavLink } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useAuth } from "@/auth/AuthContext";
import { useChassisText } from "@/i18n/chassis";
import { ACT_TONE, CHASSIS_ROLES, CHASSIS_TONE, cdb, type ActStatus, type ChassisAction, type ChassisStatus } from "@/lib/chassis";

export const STATUS_LABEL: Record<ChassisStatus, string> = {
  expected: "Kutilmoqda", received: "Qabul qilindi", in_production: "Ishlab chiqarishda", ready: "Tayyor", in_act: "Aktda",
  shipped: "Jo'natildi", esf_issued: "ESF yozildi", closed: "Yopildi", returned_without_work: "Ishsiz qaytdi",
};
export const ACT_LABEL: Record<ActStatus, string> = {
  draft: "Qoralama", shipped: "Jo'natildi", esf_issued: "ESF yozildi", closed: "Yopildi", void: "Bekor qilindi",
};

export function ChassisBadge({ status }: { status: ChassisStatus }) {
  const tr = useChassisText();
  return <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", CHASSIS_TONE[status])}>
    <span className="h-1.5 w-1.5 rounded-full bg-current" />{tr(STATUS_LABEL[status])}
  </span>;
}
export function ActBadge({ status }: { status: ActStatus }) {
  const tr = useChassisText();
  return <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", ACT_TONE[status])}>
    <span className="h-1.5 w-1.5 rounded-full bg-current" />{tr(ACT_LABEL[status])}
  </span>;
}

/** VIN: oxirgi 6 belgi ajratib ko'rsatiladi (qidiruv shu bo'yicha qulay) */
export function Vin({ vin, className }: { vin: string; className?: string }) {
  return <span className={cn("font-mono text-[13px] tracking-wide whitespace-nowrap", className)}>
    {vin.slice(0, -6)}<b className="text-primary">{vin.slice(-6)}</b>
  </span>;
}

/** Foydalanuvchi shu amalni bajara oladimi (bazadagi tekshiruv bilan bir xil) */
export function useChassisCan() {
  const { roles } = useAuth();
  return (action: ChassisAction) => roles.includes("admin") || CHASSIS_ROLES[action].some((r) => roles.includes(r));
}

const TABS = [
  { to: "/chassis", label: "Umumiy", end: true },
  { to: "/chassis/registry", label: "Reestr" },
  { to: "/chassis/receive", label: "Qabul" },
  { to: "/chassis/acts", label: "Aktlar" },
  { to: "/chassis/reconcile", label: "Didox solishtirish" },
  { to: "/chassis/specs", label: "Spetsifikatsiyalar" },
];
export function ChassisTabs() {
  const tr = useChassisText();
  return <nav className="flex gap-1 overflow-x-auto border-b -mx-1 px-1" aria-label={tr("Shassi bo'limlari")}>
    {TABS.map((t) => <NavLink key={t.to} to={t.to} end={t.end}
      className={({ isActive }) => cn("px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors",
        isActive ? "border-primary text-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground")}>
      {tr(t.label)}</NavLink>)}
  </nav>;
}

export function ChassisHeader({ title, hint, actions }: { title: string; hint?: string; actions?: React.ReactNode }) {
  const tr = useChassisText();
  return <div className="space-y-3">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight">{tr(title)}</h1>
        {hint && <p className="text-sm text-muted-foreground">{tr(hint)}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
    <ChassisTabs />
  </div>;
}

export interface ClientOption { id: string; name: string }
export function useClients() {
  return useQuery({
    queryKey: ["chassis", "clients"],
    queryFn: async (): Promise<ClientOption[]> => {
      const { data, error } = await cdb.from("clients").select("id,name").order("name");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });
}
export interface BodyType { id: string; code: string; name: string; short_name: string; mxik_code: string | null; unit: string; requires_test: boolean; order_prefix: string | null; is_active: boolean }
export function useBodyTypes() {
  return useQuery({
    queryKey: ["chassis", "body_types"],
    queryFn: async (): Promise<BodyType[]> => {
      const { data, error } = await cdb.from("body_types").select("*").order("short_name");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });
}
