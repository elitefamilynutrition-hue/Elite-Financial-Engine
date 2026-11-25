# Elite Capital Engine — operator testing

Manual checks that Agents cannot complete alone (tenant isolation, dashboards, live keys).

## Prerequisites

- Local or preview deploy with `.env.local` filled (see `.env.example`)
- Two Supabase Auth users (A and B)
- `NEXT_PUBLIC_INVITE_CODE` set for signup gate
- Sandbox Plaid + Stripe **test** keys (not live)

## Week 1 isolation checklist

1. Sign up / log in as **User A** with a valid invite code.
2. Complete Day Zero (or seed a profile), link a sandbox bank, sync.
3. Confirm A sees only A’s accounts / transactions in the UI.
4. In Supabase SQL, as service role or via RLS-as-A session: `select count(*) from transactions where user_id = '<B>'` must be empty when querying as A (anon key + A JWT).
5. Log in as **User B**. Confirm A’s rows are invisible in UI.
6. Call classifier / dashboard as B — must not return A’s `transaction` rows.
7. `POST /api/plaid/webhook` with a forged / missing `Plaid-Verification` JWT → **401**.
8. Signup without invite (or wrong invite) → fails.

## Billing (test mode)

1. Paywall → Start 7-day trial → Stripe Checkout (test card).
2. Webhook `checkout.session.completed` / subscription events → `subscription_status` is `trialing` or `active`.
3. Dashboard unlocks; **Manage billing** opens Customer Portal.
4. Settings → Legal → Download my data (JSON) succeeds.
5. Do **not** run Delete my account on a shared prod tenant unless intentional.

## Plaid

1. Header **Connect Bank / Card** → standard Link (`Transactions`).
2. Balance Sheet **Connect Brokerage** → investment Link (`Investments` + `Transactions`).
3. Sync → investments upsert when the institution supports the product (else silently skipped).
4. Apply migration `20261125000000_plaid_webhook_receipts.sql` so webhook idempotency is durable across cold starts.

## Cron

```bash
curl -X POST "$NEXT_PUBLIC_APP_URL/api/cron/nightly" \
  -H "Authorization: Bearer $CRON_SECRET"
```

Expect JSON success. If the response is HTML, Vercel Deployment Protection / Auth is blocking the route — disable for that path or use a bypass.

## Unit tests (CI)

```bash
npm test
```

Pure libs only (tax brackets, intent, category buckets, savings leak, classify, rate limit). No network.

## Still operator-owned (not Agent)

- Plaid **Production** cutover (`PLAID_ENV=production` + dashboard webhook URL)
- Stripe **live** keys / live Price / live webhook
- Counsel review of Privacy / Terms
- Real dogfooding with personal banks
