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

/** Selected status button: solid dark background, white label and icon, darker on hover */
export const supplyStatusActiveBtnCls: Record<SupplyStatus, string> = {
  pending:
    "bg-status-red-solid border-status-red-solid text-status-solid-fg ring-2 ring-offset-2 ring-status-red-solid hover:bg-status-red-solid-hover hover:border-status-red-solid-hover hover:text-status-solid-fg",
  fulfilled:
    "bg-status-green-solid border-status-green-solid text-status-solid-fg ring-2 ring-offset-2 ring-status-green-solid hover:bg-status-green-solid-hover hover:border-status-green-solid-hover hover:text-status-solid-fg",
};

/** Unselected status button: solid dark background, white label and icon, darker on hover */
export const supplyStatusOutlineBtnCls: Record<SupplyStatus, string> = {
  pending:
    "bg-status-red-solid border-status-red-solid text-status-solid-fg hover:bg-status-red-solid-hover hover:border-status-red-solid-hover hover:text-status-solid-fg",
  fulfilled:
    "bg-status-green-solid border-status-green-solid text-status-solid-fg hover:bg-status-green-solid-hover hover:border-status-green-solid-hover hover:text-status-solid-fg",
};
