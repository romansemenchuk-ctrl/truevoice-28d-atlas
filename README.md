# TrueVoice Academy / Atlas — 4.1 preview

This branch turns Atlas into the first protected product inside a shared TrueVoice Academy account. It includes a purchase entitlement ledger, WayForPay ingestion/reconciliation primitives, a locked-but-usable member cabinet, a separate admin cabinet and the refined 28D Atlas mechanics. It is still a preview branch: `main`, live checkout behavior and public login remain unchanged until the rollout gates below are completed.

## Access model

- One Supabase Auth identity is shared across TrueVoice products.
- An account may exist without an active product entitlement. In that state the member keeps profile, products, support and logout, while protected Atlas content is never fetched.
- `mini-base` and `mini-pro` grant Atlas for 210 days from the verified purchase time.
- `atlas-28d` grants lifetime Atlas access (`valid_until = NULL`).
- `mini-upgrade` never grants Atlas by itself.
- Refund/chargeback revokes the entitlement but does not delete the account. A stale replay of an older Approved event cannot restore a terminally revoked payment.
- A newer verified `review` (for example amount/currency mismatch) suspends an existing Approved state. Review is a quarantine state: stale/equal non-terminal events cannot clear it; a fresh verified Approved re-check with a newer verification time may resolve it.
- Admin is an explicit database role. Admins land in the student view and must deliberately open the Admin cabinet; internal methodology is fetched only after a second explicit admin action.

## Security boundaries

Member APIs use Supabase SSR/Auth and the public publishable key. Auth cookies are HttpOnly, Secure and host-only in deployed environments. Each private request verifies the current Auth user and database session; mutations require same-origin + CSRF.

Payment operations are isolated in a separate server-only worker. `SUPABASE_SERVICE_ROLE_KEY`, WayForPay credentials, the bridge secret and cron secret are never sent to the browser. The landing bridge authenticates server-to-server with `ATLAS_PAYMENT_BRIDGE_SECRET`; signed WayForPay callbacks are only a trigger for re-verification, never a source of buyer ownership. Buyer email/product/amount/currency are registered from the trusted checkout path before the payment widget is returned.

`tv_core` stays outside the exposed Data API schemas. Narrow RPCs are used for member state; service-role-only RPCs handle payment/admin operations. All application tables retain RLS. Admin operations require the authenticated admin actor and write audit metadata.

## Payments and reconciliation

The payment adapter supports exact WayForPay signing/verification, deterministic modern product mapping, explicit legacy mapping rules, integer minor-unit money parsing, status normalization, amount/currency mismatch → `review`, idempotent events and terminal refund/chargeback behavior. `CHECK_STATUS` transitions use the local verification observation time, so an old provider processing timestamp cannot trap an order in review forever.

Historical import is `preview → digest → re-fetch → commit`. Preview windows are capped at 31 days. Unknown products remain `review` with no entitlement; import never silently guesses access. Admin may classify an unclassified historical review to a known product, but classification does not rewrite buyer/amount/currency/purchase time and does not grant access until a fresh provider verification resolves the review state. Manual entitlement transfer changes ownership only and does not rewrite the financial buyer email.

A daily Vercel cron calls `/api/reconcile` at `03:17 UTC`. Each candidate is rechecked with WayForPay `CHECK_STATUS`; provider/network/signature failure preserves the last verified financial/access state.

Synthetic QA uses exactly seven deterministic `provider=test` payment scenarios and never creates Auth users. Cleanup removes only `provider=test` rows and preserves WayForPay/customer rows.

## Member experience

The Academy shell renders before protected course loading. Active members open Atlas lazily; locked members stay in the cabinet. Product cards expose active/lifetime/expired/refunded/chargeback/review states and finite expiry where applicable.

The original 28 lesson text is retained. Course JSON and the four anatomy artwork plates live in `_server/`, not public `dist`, and are served only through authorized APIs. Voice recordings remain local in a per-account IndexedDB database and are not uploaded.

The breath/anatomy experience uses one monotonic phase clock: phase caption, diaphragm, lung expansion and airflow share the same state. Holds stop airflow, exhale reverses it, pause freezes all instructional anatomy, reduced-motion removes decorative motion without hiding guidance, plate switching preserves phase, and hidden tabs pause the phonation demonstration.

## Run and test

Node 22 is required.

```bash
npm ci
npx playwright install chromium
npm run test:all
npm audit
```

`test:all` runs build + unit/SQL tests + Chromium member tests + mechanics tests. The local browser harness binds only to `127.0.0.1:8081`, uses PGlite for PostgreSQL/RLS behavior and synthetic identities, sends no real email and touches no cloud/customer data.

Latest verified CI baseline on `feat/academy-access-wayforpay-20260910`:

- unit/SQL: 78 passing, 0 failing
- member browser: 14/14
- mechanics browser: 9/9
- `npm audit --omit=dev`: 0 vulnerabilities
- full `npm audit`: 0 vulnerabilities
- `git diff --check`: pass

Landing bridge branch `feat/academy-ledger-bridge-20260910`: callback 9/9, order-create 4/4, preview-health 4/4, diff check pass.

Cloud verification has exercised the seven synthetic payment states, `approved → review → stale approved`, fresh Approved re-verification after review, and audited classification of an unclassified historical review. Every verification used scoped `provider=test` data and cleaned it before commit. No synthetic Auth users or test payment rows remain; WayForPay rows remain untouched.

Measured Vercel preview state is intentionally still non-live: Atlas has public Supabase configuration but no service-role, WayForPay, bridge or cron server secrets; email login is disabled. Landing has WayForPay configured but Academy ledger mode is `off` and ledger URL/secret are absent. No checkout/provider action was used to obtain this measurement.

See `docs/qa/2026-09-10-academy-payments.md` for the exact evidence and remaining live gates.

## Configuration

```text
SUPABASE_URL=https://aqskidnelqmowzfkjieg.supabase.co
SUPABASE_PUBLISHABLE_KEY=
ATLAS_SITE_URL=https://YOUR_PREVIEW_OR_PRODUCTION_HOST
ATLAS_EMAIL_ENABLED=false
TURNSTILE_SITE_KEY=

SUPABASE_SERVICE_ROLE_KEY=
WAYFORPAY_MERCHANT_ACCOUNT=
WAYFORPAY_SECRET_KEY=
ATLAS_PAYMENT_BRIDGE_SECRET=
WAYFORPAY_LEGACY_RULES_JSON=[]
CRON_SECRET=
```

All values after `TURNSTILE_SITE_KEY` are server-only secrets. Never commit real values. `ATLAS_EMAIL_ENABLED` remains `false` until custom SMTP, OTP template, Auth rate limits and CAPTCHA are configured and a real OTP is verified.

The landing integration is separately gated by `ACADEMY_LEDGER_MODE=off|shadow|required`. `off` makes no Academy request; `shadow` records/logs bridge failures without changing current checkout behavior; `required` is the eventual fail-closed production mode and must not be enabled until the full rollout gates pass.

## Build/deployment safety

Do not serve the repository root publicly; source lessons and `_server` are intentionally outside `dist`. A generic static host cannot implement Academy authorization. The build output and protected asset paths contain no service-role or WayForPay secret values.

The repository is currently public and earlier Atlas material was historically public. New access controls cannot recall already-published copies. Confidential/internal content should not be expanded here until the repository/history/old-deployment exposure decision is made.

## Remaining launch gates

1. Configure the Atlas Vercel Preview server-only service-role / WayForPay / bridge / cron values while keeping `ATLAS_EMAIL_ENABLED=false`, then re-read preview health and verify payment/admin fail-closed paths.
2. Configure landing Preview ledger URL/secret, switch only the feature preview to `shadow`, and verify current checkout behavior remains unaffected by bridge failure/success without charging a card.
3. Review historical WayForPay preview windows. No historical commit without owner review of review/conflict/access dates.
4. Configure custom SMTP/OTP/CAPTCHA and prove real login for the explicit owner admin identity.
5. Real purchase and refund tests require explicit approval immediately before any spend/provider action.
6. Complete physical iPhone/Safari, Firefox, keyboard/screen-reader smoke, privacy disclosure, backup/restore and incident notes.
7. Resolve the public-repository/history/old-deployment exposure decision.
8. Move the ledger to `required` and promote only after every gate passes.

Anatomy artwork remains an artistic interpretation and the instructional diagrams are simplified; this is not a clinical illustration pack or a full scientific audit.
