# Elite Capital Engine — Agent Briefs (Pro-efficient)
**How to use**
1. Do **only today’s** section.
2. Run the **Ask** prompt first (Ask mode), then open a **new** Agent chat with the **Agent** prompt.
3. Check **Done when**. Commit. Close both chats.
4. Strike through or delete the day when finished — do not re-run old briefs in long threads.
**Rules**
- One Agent chat = one issue.
- Never “fix the whole app” or “re-audit everything.”
- You own: Supabase SQL/RLS apply, Plaid dashboard, Stripe dashboard, `.env` secrets.
- Prefer small diffs; stop when Done when is met.
**Repo:** `budgetdog-app/`
---
## WEEK 1 — P0 Security & tenancy
### Day 1 — Classifier cross-tenant fix
> Completed in git: tenant-scoped classifier (`b7f454d`).

**Done when**
- [x] Classifier only reads the signed-in user’s transactions
- [x] Updates cannot touch another tenant’s rows
- [x] Committed
---
### Day 2 — Stamp `user_id` on sync writes + fail-closed decrypt
> Completed in git: sync `user_id` + fail-closed decrypt (`b8632a7`).

**Done when**
- [x] New sync rows always have `user_id`
- [x] Deletes are tenant-scoped
- [x] Decrypt failures throw (no raw-token fallback)
- [x] Committed
---
### Day 3 — Plaid webhook verification + light idempotency
> Completed in git: Plaid JWT verify + idempotency (`6e83e92`).

**Done when**
- [x] Request without valid verification does nothing sensitive
- [x] Valid webhook still syncs
- [x] Duplicate delivery is harmless (idempotent)
- [x] Committed
---
### Day 4 — Schema + RLS into the repo
> Completed in git: `supabase/migrations` + `SCHEMA.md` (`9cd7d20`).

**You after**
- Apply migration/policies in Supabase if not already live.
- Spot-check: second user cannot read first user’s rows via anon client.
**Done when**
- [x] Migrations exist in git
- [x] RLS live on tenant tables
- [x] SCHEMA.md lists unique constraints used by upserts
- [x] Committed
---
### Day 5a — Invite-only signup + sign out
> Completed in git: NEXT_PUBLIC_INVITE_CODE gate + dashboard Sign out.

**Done when**
- [x] Public self-serve signup blocked without invite (or removed)
- [x] Sign out works
- [x] Committed
---
### Day 5b — Scrub personal hardcodes
> Completed in git: salary/Corvette/RSU/seed hardcodes scrubbed; legacy table `amazon_rsu_schedule` name retained.

**Done when**
- [x] Grep is clean (or only generic examples remain)
- [x] Fresh user never sees your salary/Corvette/RSU seed
- [x] Committed
---
### Week 1 weekend — Manual isolation test (no Agent) - START HERE
- [ ] Two Supabase users
- [ ] User A data invisible to User B (SQL + UI)
- [ ] Classifier as A does not pull B’s txs
- [ ] Forged webhook without valid JWT fails
- [ ] Signup without invite fails
---
## WEEK 2 — P1 Correctness & cost
### Day 1 — Unify snapshot model
> Completed: audit + charts use `historical_snapshots`; `/api/snapshot` is sole writer.

**Done when**
- [x] Audit and charts see the same snapshot data after a stamp
- [x] Committed
---
### Day 2 — Wire classify; remove bank-name transfer heuristic
> Completed: sync uses `classifyPlaidTransaction` / PFC; Chase/Citi name heuristic removed.

**Done when**
- [x] Heuristic gone from sync
- [x] Classify path used
- [x] Committed
---
### Day 3 — Stop default `reset=true` sync
> Completed: default sync resumes cursor; Full refresh button for reset; per-page cursor persist.

**Done when**
- [x] Normal load/sync resumes cursor
- [x] Full refresh is explicit
- [x] Committed
---
### Day 4 — Server-side dashboard aggregates
> Completed: `/api/telemetry/dashboard` returns accounts + 90d recent txs + baseline; page no longer select(*).

**Done when**
- [x] Dashboard no longer `select('*')` full transaction history on load
- [x] Numbers still render
- [x] Committed
---
### Day 5 — Rate limits + chat history cap
> Completed: in-memory rate limits on audit/chat/vision/classify/sync; chat history capped at 40.

**Done when**
- [x] Rapid-fire audit/chat eventually 429s
- [x] Oversized history rejected or truncated
- [x] Committed
---
## WEEK 3 — P2 Sell layer - START HERE
### Day 1 — Stripe design (Ask only) + checkout skeleton
**You first**
- Create Stripe Product + Price; note `price_id`, webhook secret.
- Apply migration `supabase/migrations/20261113000000_subscription_columns.sql`.
- Set env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, `NEXT_PUBLIC_APP_URL`.
**Ask**
Design minimal Stripe subscription gate for this Next 16 App Router app:

checkout session route
webhook updating user plan (profiles column or subscriptions table)
require active plan for Gemini-heavy routes only Reuse requireUser. No fancy pricing marketing page yet. Output: file list + acceptance criteria for Agent.

**Agent**
P2: Implement Stripe checkout + customer webhook from this plan: [PASTE ASK PLAN] Env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_ID. Do not build a full marketing site — API + minimal "Upgrade" button is enough.

**Shipped**
- `stripe` dep; `lib/stripe.ts`; columns on `user_financial_profiles` (`stripe_customer_id`, `stripe_subscription_id`, `subscription_status`)
- `POST /api/billing/checkout` (`requireUser`); `POST /api/billing/webhook` (signature verify)
- `proxy.ts` exempts `/api/billing/webhook`
- Dashboard **Upgrade** button → Checkout Session URL
- Env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, `NEXT_PUBLIC_APP_URL`

**Done when**
- [x] Checkout session creates
- [x] Webhook marks user active
- [x] Committed (test mode OK)
---
### Day 2 — Entitlement gate on Gemini routes
**Agent**
P2: Gate Gemini-heavy routes behind active subscription (audit, audit/chat, telemetry/vision, telemetry/transactions). Return 402 or 403 with a clear JSON error if inactive. Reuse the plan field/table from Day 1. No new billing provider.

**Shipped**
- `lib/auth/require-entitlement.ts` → `requireActiveSubscription` (active/trialing)
- Gated: `/api/audit`, `/api/audit/chat`, `/api/telemetry/vision`, `/api/telemetry/transactions` → **402** JSON (`payment_required`)

**Done when**
- [x] Inactive user blocked from Gemini routes
- [x] Active user succeeds (status active/trialing)
- [x] Committed
---
### Day 3 — Legal stubs + data rights
**Ask**
Draft short plain-English outlines for /privacy and /terms appropriate for a Plaid + Gemini personal finance app (subprocessors, not advice, retention). Also minimal export/delete API shapes using requireUser. Do not edit files yet.


**Agent**
P2: Add /privacy and /terms pages (accurate stubs), footer/nav links, and a "Not financial advice" disclaimer near audit UI. Add session-scoped export and delete endpoints (or delete flow) for the user. No fake SOC2/compliance badges.

**Shipped**
- `/privacy` + `/terms` stubs (Elite Capital Engine only; marked not counsel-reviewed)
- Footer + login links; proxy allows public legal pages
- Audit disclaimer on Run Gemini Audit, audit report, AuditChatDrawer
- `GET /api/account/export` + `POST /api/account/delete` (`requireUser`, no Stripe gate)
- Product branding scrub: Elite Capital Engine only in UI/prompts/docs branding

**Done when**
- [x] Pages reachable
- [x] Disclaimer visible on audit
- [x] Export/delete exists or documented manual path with API stub
- [x] Committed
---
### Day 4 — Sentry + CI
**You first**
- Create Sentry project; set `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` (same value) in `.env.local`.
**Shipped**
- `@sentry/nextjs` + `instrumentation.ts` / `instrumentation-client.ts` + server/edge configs (no-op when DSN unset)
- `app/global-error.tsx` reports client boundary errors
- Runtime-only Sentry (no `withSentryConfig` / source-map upload; no auth token required)
- `.github/workflows/ci.yml` — npm ci, lint, build on push/PR to main|master

**Operator note**
- DSN wired in `.env.local` (gitignored). Smoke test (`Sentry smoke test`) verified in Sentry Issues. Restart `npm run dev` after any DSN change.
- Upgrade/Stripe console errors are expected until go-live — not Sentry failures.

**Done when**
- [x] Test error appears in Sentry (dev) OR init is clearly wired
- [x] CI workflow file exists
- [x] Committed
---
### Day 5 — Ledger truth + env example + metadata
**Shipped**
- `MASTER_LEDGER.md` reconciled: Next 16, fail-closed crypto, supabase-admin, removed false `telemetry/baseline|snapshot|paystub`, added ECE routes/components, schema → `SCHEMA.md` + migrations
- Phase 6 split (webhook verify done; cron shipped in Phase 6.3 below)
- Week 4 differentiation shipped (see WEEK 4)
- `.env.example` keys only (incl. Sentry + `CRON_SECRET`)
- `app/layout.tsx` metadata Elite Capital Engine

**Done when**
- [x] Ledger matches repo
- [x] `.env.example` present
- [x] Title/metadata fixed
- [x] Committed
---
## WEEK 4 — P3 Differentiation

### Shipped early — Category burn UX + dispute (unscheduled)
**Shipped**
- Category Burn rolls up to ~8 display buckets (`lib/analytics/category-buckets.ts`); detailed PFC kept for drill-down
- Click bucket → `CategoryBurnDrawer` filtered ledger (30d) with dispute/reclassify + optional reimbursement link
- Migration `20261117000000_transaction_overrides.sql` + `PATCH /api/transactions/[id]/override`
- Intent precedence: user override → classify; one-off/reimbursed/business excluded from burn; Survival Floor remains survival-only
- Sync/webhook pending→posted hygiene via `pending_transaction_id`; CC payments stay transfers
- Ledger uses humanized category labels

### Shipped — Catch-up: burn integrity + sinking funds + anomaly coach v1
**Shipped in this pass**
- Dashboard `/api/telemetry/dashboard` scopes `recent_transactions` to live `financial_accounts.plaid_account_id` only (orphans never feed burn/ledger)
- Sync deletes orphan txs (`account_id` not in live accounts) for the session user; returns `orphans_deleted`
- Insurance remap: `GENERAL_SERVICES_INSURANCE` / `INSURANCE_*` + merchant hints (Root, Geico, …) → essentials + survival
- Category Burn credit netting (same-merchant + `reimbursement_tx_id`) + cross-account date/amount/name dedupe
- Survival Floor UI shows monthly sinking pad + fund list; SettingsDrawer already edits sinking funds
- Audit + audit/chat receive sinking_funds context
- `AnomalyReviewPanel` (“Review charges”) → override PATCH / Ask AI seed into AuditChatDrawer

**Known data issue**
- Duplicate/orphan Plaid `account_id`s after re-link inflate burn when querying by `user_id` only — always filter by live accounts; run Sync (or manual orphan DELETE SQL) after re-link.

### Product gaps / coaching layer (upcoming)
**Done when (track separately)**
- [x] Orphan transaction hygiene — dashboard/burn live-accounts only; sync cleanup of orphan txs
- [x] Insurance / `GENERAL_SERVICES_INSURANCE` + merchant hints → essentials + survival
- [x] Credit↔debit netting for Category Burn (same merchant and/or `reimbursement_tx_id`)
- [x] Sinking funds visible near Survival Floor + audit/chat context
- [x] Proactive anomaly coach v1 — large/weird charges → one-off / reimbursed / expected; wire to dispute + chat
- [x] Leak / seasonal wave detection (subscriptions + annual premiums) — Week 4 Day 3 heuristic v1
- [ ] GOD MODE / market analysis — **DEFERRED** (not this product surface)

### DEFERRED — GOD MODE / market analysis (do not build in ECE public product)
- Live stock/options trading UI, trade execution, or personalized securities advice are **out of scope** for Elite Capital Engine coaching.
- Education vs advice: any future market tooling must stay educational / operator-lab only, private, compliance-reviewed — never ship as default ECE features or as “advice.”
- Do not schedule into Week 4 Day briefs until an explicit private/operator-only lab charter exists.

### Day 1 — Account exclusion (Phase 7.2)
**Shipped**
- Migration `20261118000000_week4_account_exclusion.sql` → `financial_accounts.exclude_from_net_worth`
- `PATCH /api/accounts/[id]/exclude`; Balance Sheet checkbox “Exclude from NW”
- `lib/analytics/net-worth.ts` filters operational accounts; used by dashboard TelemetryGrid, snapshot, FIRE payload

**Done when**
- [x] Excluded account omitted from NW aggregates
- [x] Committed
---
### Day 2 — Profile setup / recalculate (Phase 7.1 / 7.3)
**Shipped**
- `POST /api/profile/setup` — Day Zero upsert + optional sinking funds / liquidity event + telemetry
- `POST /api/profile/recalculate` — patch profile + return survival / wealth quota / FIRE
- DayZeroIntake → setup; SettingsDrawer architecture save → recalculate

**Done when**
- [x] Profile changes recalculate server-side
- [x] Committed
---
### Day 3 — Savings ratio + subscription leak (Phase 8.1)
**Shipped**
- `lib/analytics/savings-leak.ts` — 30d savings ratio + 120d subscription/leak heuristics
- Dashboard payload: `savings_ratio`, `subscription_leaks`
- `SavingsRatioCard` + `SubscriptionAuditCard` on Command Center

**Done when**
- [x] Cards render real computed data
- [x] Committed
---
### Day 4 — WealthMatrix Rule of 25 + inflation (Phase 8.2)
**Shipped**
- `lib/analytics/fire-projection.ts` — FI target = annual burn × (100/SWR); projection uses profile age/SWR/inflation + savings contribution
- WealthMatrixChart driven by dashboard `fire` payload; real-return (CPI) toggle; removed hardcoded 8%+$42k theater
- Honest On Pace vs terminal projection clearing FI target

**Done when**
- [x] Chart uses profile inputs
- [x] Toggle works
- [x] Committed
---
### Day 5 — Optional affiliate CTA (Phase 8.3) — SKIPPED
**Consciously skipped:** balance-transfer / credit affiliate CTA needs counsel-reviewed disclosure copy; prefer no ship over fake compliance. Revisit post-counsel.

**Done when**
- [x] CTA + disclosure OR consciously skipped
- [x] Committed if shipped (N/A — skipped)
---
## NEXT / ops (post Week 4)

### Phase 6.3 — Vercel Cron nightly sync + snapshots — SHIPPED
**Shipped**
- `GET|POST /api/cron/nightly` — `CRON_SECRET` via `Authorization: Bearer` or `x-cron-secret`
- Proxy exempts `/api/cron/*` (no session cookies)
- Per user with `plaid_items`: resume-cursor sync (`lib/plaid/sync-user.ts`) then `stampHistoricalSnapshot` (`lib/analytics/stamp-snapshot.ts`)
- `vercel.json` cron `0 12 * * *` UTC → `/api/cron/nightly`
- Session routes thinned to call the same helpers (`/api/plaid/sync-transactions`, `/api/snapshot`)

**Operator**
- Set `CRON_SECRET` in Vercel env **and** `.env.local` for manual curls.
- Cron **only fires on Vercel deploy**. Local/dev stays **Sync Telemetry** + **Stamp Snapshot**.
- Manual test: `curl -X POST "$NEXT_PUBLIC_APP_URL/api/cron/nightly" -H "Authorization: Bearer $CRON_SECRET"`

**Done when**
- [x] Cron route exists, secret-gated
- [x] Multi-tenant sync+snapshot loop
- [x] vercel.json present
- [x] Committed

### Stripe billing UX wrap — SHIPPED (test mode)
**Shipped**
- Product gate: `trialing|active` required for dashboard + product APIs (not only Gemini)
- Paywall UI: inactive → **Start 7-day trial** Checkout; header Upgrade removed
- Checkout: `trial_period_days: 7`, `allow_promotion_codes: true`, $20/mo Price
- `/about` + refreshed `/privacy` + `/terms` (subscription/EULA-style); Settings → Legal; footer links
- Invite signup unchanged (beta)

**Operator**
- **Vercel Authentication must stay OFF on Production** — otherwise Stripe webhooks + cron get `401 Protected deployment`
- Test keys + webhook `whsec` + `STRIPE_PRICE_ID` + `NEXT_PUBLIC_APP_URL` on Vercel; redeploy after secret changes
- Live `sk_live` / real charges still deferred until ready

**Done when**
- [x] Paywall + API entitlement
- [x] Trial checkout copy
- [x] Legal pages updated
- [x] Docs reconciled

### Still open / deferred
| Item | Status | Notes |
|------|--------|-------|
| Phase 6.2b Plaid Production webhook URL cutover | ☐ ops | Code supports `PLAID_ENV=production`; dashboard URL is operator-owned |
| Stripe **live** keys / real charges | deferred | Test-mode go-live done; switch to `sk_live` + live Price/webhook when charging for real |
| Webhook job queue | stretch only | Only if syncs actually time out |
| GOD MODE / market analysis | deferred | Not ECE public product; education vs advice; private lab charter later |
| Affiliate CTA | skipped | Disclosure-heavy; prefer no ship |
| Counsel-reviewed legal | open | Stubs only — not a substitute for lawyer review |

---
## Stretch (Weeks 5–6) — only if needed
Use **Ask** for design; Agent only for a single agreed slice.
| Topic | Ask focus | Agent only if… |
|-------|-----------|----------------|
| Webhook job queue | timeout evidence exists | syncs actually timing out |
| Household/B2B orgs | selling advisors | committed GTM |
| MFA | Supabase settings | compliance asks |
| RAG tax (8.4) | ROI doubtful | post-revenue |
---
## Emergency token-save prompts
**Scope check (Ask)**
I only want to work on: [ONE ISSUE]. List the maximum 3 files to touch. Refuse any wider refactor.


**Stop-run (Agent — paste if it wanders)**
Stop. Do not continue into other issues. Finish only the acceptance criteria already stated, then summarize files changed.


---
## Progress tracker
| Week | Day | Status |
|------|-----|--------|
| 1 | 1 Classifier | ☑ |
| 1 | 2 Sync user_id | ☑ |
| 1 | 3 Webhook verify | ☑ |
| 1 | 4 Schema/RLS | ☑ |
| 1 | 5a Signup gate | ☑ |
| 1 | 5b Hardcode scrub | ☑ |
| 2 | 1 Snapshots | ☑ |
| 2 | 2 Classify | ☑ |
| 2 | 3 Cursor sync | ☑ |
| 2 | 4 Aggregates | ☑ |
| 2 | 5 Rate limits | ☑ |
| 3 | 1 Stripe checkout | ☑ |
| 3 | 2 Entitlements | ☑ |
| 3 | 3 Legal/export | ☑ |
| 3 | 4 Sentry/CI | ☑ (DSN smoke verified) |
| 3 | 5 Ledger/env | ☑ |
| 4 | 0 Category burn UX | ☑ |
| 4 | Catch-up burn/sinking/anomaly | ☑ |
| 4 | 1 Exclusions | ☑ |
| 4 | 2 Profile APIs | ☑ |
| 4 | 3 Savings/subs (+ leak/seasonal) | ☑ |
| 4 | 4 WealthMatrix | ☑ |
| 4 | 5 Affiliate opt | ☑ skipped |
| 6 | 2b Plaid prod webhook ops | ☐ |
| 6 | 3 Nightly cron sync+snapshot | ☑ |
| — | Stripe test billing UX wrap | ☑ |
| — | Stripe live keys | deferred |
| — | Webhook job queue | stretch / if timeouts |
| — | GOD MODE / markets | deferred |