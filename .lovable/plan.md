This is a large multi-area request. To ship it safely without breaking existing flows, I'll do it in 3 phases. Please confirm or reorder priorities before I start.

## Phase 1 — Critical fixes (highest impact, smallest risk)

1. **Order 404 fix (#11)** — Audit `/orders/:id` route, ensure `OrderDetail` loads any valid UUID, fix broken links (likely caused by stale IDs or missing tab routes). Add tabs: Stages, Warehouse, History, Audit, Workers, OTK, Reports, Files.
2. **OTK restructure (#4, #5, #6)**:
   - OTK page → list of orders first; click opens vertical stage timeline
   - Remove inline OTK textarea/checkbox/save from order list cards
   - Stage start: require ≥1 worker (allow many via junction)
   - Stage finish: require `qc_passed=true`, otherwise red warning "Sifat nazorati tasdiqlamagan"
3. **Cashier edit permissions (#2)** — already mostly in place via RLS; verify edit buttons render for cashier on income/expense/employee rows.
4. **Kassa search (#3)** — add search input with magnifier left of date filters; filter by recipient/source/amount/comment/type.

## Phase 2 — Production & reporting

5. **Multi-worker per stage (#6)** — new `stage_workers` table (stage_id, worker_id, worker_name). Keep existing `worker_id` for backward compat.
6. **Production progress labels (#7)** — render stage names under each progress segment on ProductionBoard.
7. **Audit log expansion (#8)** — log stage start/finish with worker names + durations; show columns: order#, stage, worker, start, end, duration.
8. **Reports menu + Order Report (#9, #10)** — new `/reports` admin-only sidebar item; per-order report tab with stages/workers/durations/materials/OTK/dates; reuse existing `export-order-pdf` edge function.

## Phase 3 — Full i18n (#1)

9. Add **RU** and **UZ-Cyrillic** translation files alongside existing `uz.ts`. Audit every page for hardcoded English strings, route them through `t.*`. This is the largest single task (~15 files, hundreds of strings) and best done last so earlier UI changes don't get re-translated.

## Technical notes

- New table: `stage_workers (id, stage_id, worker_id, worker_name, created_at)` with RLS for manager/admin/marketing.
- Audit triggers: add inserts in stage start/finish handlers (frontend `logAudit` calls already exist — extend payload with worker + duration).
- i18n: extend `I18nProvider` to support 3 locales with a switcher (already exists).
- No data deletion. No user/role changes.

## Question for you

Phase 3 (full RU + UZ-Cyrillic translation) is the biggest chunk — roughly equal in effort to Phases 1+2 combined. Do you want me to:

**A.** Do all 3 phases in one go (longer turnaround, single delivery)
**B.** Ship Phase 1+2 first, then translations as a follow-up
**C.** Start with translations only, then functional fixes

I recommend **B** so you can test critical fixes immediately while I work on translations.