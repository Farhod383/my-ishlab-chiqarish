export type SupplyStatus = "pending" | "fulfilled";

export const supplyStatusLabel: Record<SupplyStatus, string> = {
  pending: "Kutilmoqda",
  fulfilled: "Ta'minlandi",
};

export function normalizeSupplyStatus(s: string): SupplyStatus {
  return s === "fulfilled" ? "fulfilled" : "pending";
}

/** Compact status chip on a white card: colored border + colored bold label, no filled background. */
export const supplyStatusCls: Record<SupplyStatus, string> = {
  pending: "border-status-red text-status-red-ink",
  fulfilled: "border-status-green text-status-green-ink",
};

/** Status text color for labels and values shown on white card surfaces. */
export const supplyStatusTextCls: Record<SupplyStatus, string> = {
  pending: "text-status-red-ink",
  fulfilled: "text-status-green-ink",
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
