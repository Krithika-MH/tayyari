# Architecture & Product Decisions (`DECISIONS.md`)

1. **Deterministic Money Math Over LLM Math**:
   - LLMs (`SarvamLlmProvider`) are strictly limited to extracting intent (`change_quantity`, `add_expense`, `add_task`) and drafting human-readable messages. All totals, deltas, projected budgets, and over/under calculations happen in `lib/domain/budget.ts` (`computeImpact`, `summarizeBudget`, `isStaleProposal`) with `Intl.NumberFormat('en-IN')`.

2. **Server-Side Repository + Optional Test-Only In-Memory Mode**:
   - Production runtime uses `SupabaseRepository` (`@supabase/supabase-js` with `SUPABASE_SERVICE_ROLE_KEY` strictly on the server, RLS enabled on all tables with zero public policies).
   - `MemoryRepository` exists for `npm run selftest` (and explicit `ENABLE_DEMO_MEMORY_DB=true` local evaluation only). `/api/health` and `/status` always report Supabase as red if `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are absent.

3. **Member Access Links (`/e/{eventId}?t={token}`)**:
   - Families share per-member random access tokens instead of requiring passwords. Every server route resolves the member from `eventId` + `t` (or `x-tayyari-token`), checks role permissions, and strips rupee amounts from API JSON payloads when `can_see_amounts === false`.

4. **One NudgeBee Workflow for Both Approval Flows**:
   - `POST /api/decisions/:id/submit` and `POST /api/leftovers/:id/submit` share a single NudgeBee webhook workflow differentiated by `kind` (`change_request` | `leftover_outreach`).
   - Callbacks hit `POST /api/nudgebee/callback` protected by constant-time `Authorization: Bearer` verification, Zod validation, `idempotency_keys` deduplication, conflict detection (`409`), and stale baseline checks.

5. **Flagsmith Remote Config (`plan_limits`) + Live Layout Switching**:
   - Evaluates per `event_id` with traits `plan`, `city`, `event_type`, `language`. Supports both `decision_card_style` (`impact_first` | `compact`) and module toggles (`module_vendor_finder`, `module_leftover_food`, `module_planning_agent`), plus `plan_limits` JSON remote config. If Flagsmith is unreachable, falls back cleanly to documented defaults with a visible UI warning chip.

6. **Firebase Full-Stack Hosting Strategy**:
   - Because Tayyari uses Next.js 15 App Router server route handlers (keeping all API keys and `CALLBACK_SECRET` server-side), deployment targets **Firebase App Hosting** (`apphosting.yaml`) / Firebase Web Frameworks rather than static-only export.
