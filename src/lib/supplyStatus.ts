export type SupplyStatus = "pending" | "fulfilled";

export const supplyStatusLabel: Record<SupplyStatus, string> = {
  pending: "Kutilmoqda",
  fulfilled: "Ta'minlandi",
};

export function normalizeSupplyStatus(s: string): SupplyStatus {
  return s === "fulfilled" ? "fulfilled" : "pending";
}

/** Status chip shown on a solid colored card: white border + white bold label. */
export const supplyStatusCls: Record<SupplyStatus, string> = {
  pending: "border-status-solid-fg text-status-solid-fg",
  fulfilled: "border-status-solid-fg text-status-solid-fg",
};

/** Labels and values inside a solid card stay white (the card itself carries the status color). */
export const supplyStatusTextCls: Record<SupplyStatus, string> = {
  pending: "text-status-solid-fg",
  fulfilled: "text-status-solid-fg",
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
