export type SupplyStatus = "pending" | "fulfilled";

export const supplyStatusLabel: Record<SupplyStatus, string> = {
  pending: "Kutilmoqda",
  fulfilled: "Ta'minlandi",
};

export function normalizeSupplyStatus(s: string): SupplyStatus {
  return s === "fulfilled" ? "fulfilled" : "pending";
}

/** Badge / read-only pill: light background, dark text, tinted border */
export const supplyStatusCls: Record<SupplyStatus, string> = {
  pending: "bg-status-red/10 text-status-red border-status-red/30",
  fulfilled: "bg-status-green/10 text-status-green border-status-green/30",
};

/** Solid dot used in lists and notifications */
export const supplyStatusDotCls: Record<SupplyStatus, string> = {
  pending: "bg-status-red",
  fulfilled: "bg-status-green",
};

/** Selected status button: stronger background tint, dark text, dark border */
export const supplyStatusActiveBtnCls: Record<SupplyStatus, string> = {
  pending:
    "bg-status-red/25 text-status-red-ink border-status-red-ink hover:bg-status-red/35 hover:text-status-red-ink",
  fulfilled:
    "bg-status-green/25 text-status-green-ink border-status-green-ink hover:bg-status-green/35 hover:text-status-green-ink",
};

/** Unselected status button: light tinted background, dark text, dark tinted border */
export const supplyStatusOutlineBtnCls: Record<SupplyStatus, string> = {
  pending:
    "bg-status-red/10 border-status-red-ink/60 text-status-red-ink hover:bg-status-red/20 hover:text-status-red-ink",
  fulfilled:
    "bg-status-green/10 border-status-green-ink/60 text-status-green-ink hover:bg-status-green/20 hover:text-status-green-ink",
};
