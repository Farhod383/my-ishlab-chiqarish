# Final Warehouse + HR + Instrument + Production Upgrade

This is a large, multi-module change. I'll keep all existing data, the purple UI, current permissions, and deployment.

## 1. Database changes (one migration)

New columns (non-destructive, with safe defaults):
- `products`: `priority` text default `'green'` (`green`/`yellow`/`red`), `currency` text default `'UZS'`
- `stock_movements`: `location` text default `'Asosiy zavod'`, `currency` text default `'UZS'`, `unit_price_currency` text default `'UZS'`
- `returns`: `order_id` uuid null, `location` text default `'Asosiy zavod'`
- `cash_*`, `instruments`: untouched

New tables:
- `locations(id, name, created_at)` — seeded with `Asosiy zavod`, `Zavod51`
- `form_history(id, field_key, value, user_id, created_at)` — for supplier/source/country/phone/recipient autocomplete; unique on (field_key,value)
- `entity_audit(id, entity, entity_id, action, old_value jsonb, new_value jsonb, actor_id, actor_name, role, created_at)` — structured edit/delete log

GRANTs + RLS on all new tables (read all authenticated; manage limited per role).

## 2. Shared components

- `ProductPicker.tsx` — searchable combobox (Command) used by all warehouse/instrument/order forms; shows `name — qty unit`.
- `SmartAutocomplete.tsx` — text input with suggestions pulled from `form_history` (free-typed values still saved on submit).
- `LocationSelect.tsx` — dropdown bound to `locations`.
- `CurrencyToggle.tsx` — UZS/USD switch.
- `PriorityDot.tsx` — green/yellow/red indicator.
- `auditDiff.ts` — helper writing structured old→new entries to `entity_audit`.

## 3. Page updates

- **WarehousePage / SupplyPage / ReturnsPage / DefectsPage / InstrumentsTab**: use ProductPicker, SmartAutocomplete, LocationSelect, CurrencyToggle. Add edit/delete actions on every row with audit logging. Returns gets optional order link.
- **Product create/edit**: priority + currency fields; priority dot in product list; per-location stock breakdown in detail.
- **HRPage**: employee profile dialog with full instrument history (active + returned, with issuer, dates, comments). Termination guard already exists.
- **ProductionBoard / OrderDetail**: remove the "only one stage running at a time" guard so Kesish/Payvandlash/Tayyorlash can run in parallel. Keep per-stage OTK, timing, worker, audit.
- **AuditLog page + sidebar**: gate strictly to `admin` role (sidebar item hidden, route protected, direct URL blocked).
- **Global edit/delete**: add Edit/Delete buttons across products, prixod, rasxod, vozvrat, brak, instruments, employees, stages, assignments, orders, kassa — each writes to `entity_audit` with old/new diff.

## 4. Transliteration

- Add `src/lib/translit.ts` with Latin↔Cyrillic maps (uz-latin, uz-cyrl, ru).
- HR table renders `full_name` through the active locale's transliterator. Stored value stays untouched.

## 5. UI

- Keep purple tokens, spacing, layout. No visual overhaul — only new controls slot into existing dialogs/tables.

## Technical notes

- One migration file adds all columns/tables + GRANTs + RLS. No data loss.
- `entity_audit` is additive; existing `audit_log` keeps working for legacy events.
- All new selects fall back gracefully if `locations` is empty.
- Parallel-stage change is a single guard removal; status transitions unchanged.

## Scope acknowledgement

This is ~12–15 files of edits plus 4–5 new components and one migration. I'll batch the work and verify build at the end.

Approve to proceed, or tell me which sections to drop/prioritize (e.g. ship instruments + audit first, defer transliteration).
