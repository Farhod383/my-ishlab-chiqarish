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
  pending: "bg-status-red/20 text-status-red border-status-red hover:bg-status-red/30 hover:text-status-red",
  fulfilled: "bg-status-green/20 text-status-green border-status-green hover:bg-status-green/30 hover:text-status-green",
};

/** Unselected status button: transparent with tinted border/text */
export const supplyStatusOutlineBtnCls: Record<SupplyStatus, string> = {
  pending: "border-status-red/40 text-status-red hover:bg-status-red/10 hover:text-status-red",
  fulfilled: "border-status-green/40 text-status-green hover:bg-status-green/10 hover:text-status-green",
};
