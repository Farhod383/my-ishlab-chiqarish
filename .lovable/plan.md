# Instrument Management System

Add a complete factory tool/instrument tracking module integrated with Warehouse and HR.

## 1. Database (migration)

New tables:

- **instruments** — name, category, inventory_number, quantity, status (active/repair/written_off), comment
- **instrument_assignments** — instrument_id, employee_id, quantity, issued_at, returned_at (null = still held), issue_comment, return_comment, issued_by, returned_by

RLS: read for all authenticated; manage for `admin`, `warehouse`, `cashier`, `hr`.

Triggers:
- On INSERT into assignments → decrement `instruments.quantity`
- On UPDATE setting `returned_at` → increment `instruments.quantity`

Helper view/function: `employee_held_instruments(employee_id)` returning currently-held items.

## 2. Warehouse page — new "Instrumentlar" tab

Add third tab next to existing "Umumiy qoldiq" and "Harakatlar tarixi":

- Search + table of instruments (name, category, inv #, qty, status)
- Add / Edit / Delete dialogs (admin/warehouse/cashier)
- Two action buttons: **Berish** (issue) and **Qaytarib olish** (return)
  - Issue dialog: employee select, instrument select, quantity, date, comment
  - Return dialog: employee select → filter instruments they hold → quantity, date, comment

## 3. HR page integration

In each employee row, add an expand/details button showing currently held instruments (name × qty, issue date). Also visible in employee edit dialog.

## 4. Termination guard

When changing employee status to `inactive` (or setting leave_date), check held instruments. If any exist → block save, show toast listing instruments. Otherwise proceed.

## 5. Audit log

Insert into `audit_log` on: instrument created/edited/deleted, issued, returned, termination blocked, terminated. Use existing `audit_log` table with entity='instrument'/'employee'.

## 6. i18n

Add Uzbek strings under `warehouse.instruments` and `hr.instruments` namespaces.

## Files

- `supabase/migrations/<new>.sql` — tables, RLS, triggers
- `src/pages/WarehousePage.tsx` — add Instruments tab
- `src/pages/HRPage.tsx` — held instruments display + termination guard
- `src/i18n/uz.ts` — new strings

## Technical notes

- Realtime: subscribe to `instruments` and `instrument_assignments` on warehouse + HR pages
- Quantity decrement uses SECURITY DEFINER trigger to bypass any future RLS concerns
- Soft return (set `returned_at`) preserves history vs delete
