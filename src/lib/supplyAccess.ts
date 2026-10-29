import type { AppRole } from "@/types/erp";

// Existing ERP departments can view procurement; ordinary workers cannot.
export const SUPPLY_VIEW_ROLES: AppRole[] = [
  "admin", "marketing", "manager", "warehouse", "supply", "otk",
  "hr", "cashier", "chief_accountant", "engineer", "accountant",
];

export function canViewSupply(roles: AppRole[]): boolean {
  return roles.some((role) => SUPPLY_VIEW_ROLES.includes(role));
}