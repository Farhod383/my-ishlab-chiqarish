# Final ERP Update Plan

This is a large multi-area change. I'll break it into 4 logical phases. Existing data, permissions and UI are preserved throughout — no destructive migrations.

## Phase 1 — OTK, Kassa & Currency (UI-only fixes)

### 1.1 OTK dashboard cards
File: `src/pages/OtkPage.tsx`
- Compute `ordersByColor` alongside existing `counts`: for each color, count distinct `order.id` whose `worstColor === c` (or stages of that color).
- Show two lines per card: `{N} ta tekshiruv` + `{M} ta zakaz`. Keep existing calculations intact.

### 1.2 Low-stock list
File: `src/pages/Dashboard.tsx` (low stock card) + `src/pages/WarehousePage.tsx` if limited there.
- Remove any `.slice(0, N)` / `.limit(N)`.
- Wrap in a scrollable container (`max-h-[400px] overflow-y-auto`).
- Each row clickable → links to the warehouse product (existing route).
- Show: name, stock_qty, min_limit, unit, location.

### 1.3 Currency formatting fix
File: `src/lib/format.ts` — add `fmtMoney(amount, currency)` that:
- Uses `fmtNum` for thousands-dot separator.
- Appends symbol: UZS→`so'm`, USD→`$`, EUR→`€`, CNY→`¥`, RUB→`₽`.
- Never multiplies by 1000 / adds zeros.
Then audit Kassa, Reports, Dashboard, PDF/DOCX edge functions for any `* 1000` or wrong template. Replace with `fmtMoney`.

### 1.4 Corporate-card payment type
Already implemented in previous turn. Verify Kassa shows separate balance/income/expense cards for `cash` vs `corporate_card` — confirm no regressions.

## Phase 2 — Parallel stages + shared Admin/Nachalnik control

### 2.1 Allow parallel in-progress stages
File: `src/pages/OrderDetail.tsx` (and `NachalnikPage.tsx`).
- Find logic that blocks starting stage N+1 while N is `in_progress` (likely a check on previous stage status). Remove the sequential gate so any pending stage can be started independently.
- Keep OTK/qc logic unchanged.

### 2.2 Start flow requires employees + manual date
Already partly in `StageStartDialog`. Verify it:
- Uses `MultiEmployeeSelect` (multi, searchable, HR-sourced).
- Has a "Boshlanish sanasi" datetime input defaulting to `now()` but editable.
- Rejects submit if `workers.length === 0` with the required Uzbek error.
- Saves `started_at` from the chosen datetime (not `now()`).

### 2.3 Shared Admin / Nachalnik visibility (realtime)
- Verify `NachalnikPage` query does NOT filter by `started_by` / role.
- Add realtime subscription:
  ```ts
  supabase.channel('order_stages').on('postgres_changes',
    { event: '*', schema: 'public', table: 'order_stages' }, reload).subscribe();
  ```
  in `NachalnikPage`, `OrderDetail`, `OtkPage`, and the dashboard.
- Migration: `ALTER PUBLICATION supabase_realtime ADD TABLE public.order_stages;` (idempotent guard).
- Audit log entries already capture `actor_name`; keep "who started / who finished" by logging on finish too.

## Phase 3 — Real notification system

### 3.1 DB
New migration:
- `notifications` table: `id, recipient_id (uuid, nullable for broadcast), sender_id, sender_name, type text, title text, body text, link text, entity text, entity_id uuid, read_at timestamptz, created_at timestamptz default now()`.
- GRANTS for authenticated + service_role.
- RLS: recipient or admin can SELECT; authenticated can INSERT; recipient can UPDATE (mark read).
- Add table to `supabase_realtime` publication.
- Replica identity full.

### 3.2 Frontend
- New `src/components/NotificationBell.tsx` rendered in `Layout.tsx` header.
  - Loads unread count, dropdown list, mark-read, click → `navigate(link)`.
  - Subscribes to realtime inserts → toast (`sonner`) + browser `Notification` API (request permission once).
- Helper `src/lib/notify.ts` with `notify({type, title, body, link, recipient_id?})` that inserts a row.
- Trigger sites (frontend, after the existing audit log call):
  - OTK approved / rejected → `OtkPage.save`
  - Stage started / finished → `StageStartDialog` / finish handler
  - Order completed → wherever status flips to `completed`
  - New order created → `NewOrder.tsx`
  - Low stock warning → on warehouse stock update if `stock_qty < min_limit`
  - Long overdue instrument return → cron-like check on `InstrumentsTab` load (≥30d).

### 3.3 Browser notifications
- `NotificationBell` requests permission on mount (once, only if `default`).
- On realtime insert, also fire `new Notification(title, { body, icon })` when `document.hidden`.

### 3.4 Click routing
- Map notification `entity` → route: `order`→`/orders/:id`, `stage`→`/orders/:order_id#stage-:id`, `otk`→`/otk`, `product`→`/warehouse?product=:id`, `instrument`→`/hr` (instruments tab).

## Phase 4 — Audit log separation

Confirm audit_log writes remain at every action site (already true). Notifications are inserted in parallel, not replacing.

---

## Technical notes
- No destructive SQL: only `CREATE TABLE notifications` + `ALTER PUBLICATION ... ADD TABLE`. Existing tables untouched.
- All transliteration continues via existing `useLocalize` hook.
- Sequential gate removal: I'll grep `OrderDetail.tsx` for the disabled-button condition rather than guessing.

## Out of scope
- Push notifications via service worker (using browser Notification API only, as requested).
- Backend cron for low-stock — done client-side on data load to keep MVP simple.

Approve and I'll execute Phase 1 → 4 in that order.