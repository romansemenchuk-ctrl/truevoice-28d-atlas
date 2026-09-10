# TrueVoice Academy 4.1 — QA evidence

Date: 2026-09-10

Branches:
- Atlas: `feat/academy-access-wayforpay-20260910`
- Landing: `feat/academy-ledger-bridge-20260910`

This document records synthetic/local/CI verification only. It does not claim real OTP delivery, physical-device certification, a real WayForPay purchase/refund, historical customer import or production rollout.

## Verified Atlas baseline

Reference CI run: GitHub Actions `Academy Feature CI` run `34433931844`, head `229e0794e47d4cd7656a6a944b8fc81b1d7a101e`.

Commands executed from a clean checkout:

```bash
npm ci
npx playwright install --with-deps chromium
npm run test:all
npm audit --omit=dev
npm audit
git diff --check 7c2c25ae693f1f04d84df85f446a34600fe861d4 HEAD
```

Result:
- clean `npm ci`: pass
- unit/SQL: 70 passing, 0 failing
- member browser: 14/14
- mechanics browser: 9/9
- production dependency audit: 0 vulnerabilities
- full dependency audit: 0 vulnerabilities
- diff check: pass

The browser suite used Playwright 1.63.0 / Chromium in GitHub Actions. The browser harness is localhost-only with synthetic identities and PGlite; it did not connect to Supabase or real customer data.

## Verified access-policy behavior

Automated SQL/RLS tests prove:
- `mini-base` → Atlas for 210 days
- `mini-pro` → Atlas for 210 days
- `atlas-28d` → lifetime Atlas access (`valid_until = NULL`)
- `mini-upgrade` → no Atlas entitlement by itself
- disabling a sold product does not revoke an already issued entitlement
- verified account without active entitlement keeps its account shell but cannot authorize Atlas
- expired entitlement keeps the account but denies Atlas
- explicit admin role can authorize Atlas without a purchase; admin identity is not inferred from first login
- user B cannot read user A state through RLS or member RPCs
- refund keeps account identity but revokes Atlas
- terminal refund cannot be resurrected by an older replayed Approved event
- anonymous and ordinary student access to internal/admin content remains denied

## Verified payment-worker behavior

Automated tests prove:
- bridge bearer secret is required and compared in constant-time code paths
- payment API accepts JSON only and enforces a request-body cap
- trusted order registration uses server-supplied checkout ownership facts
- callback/provider-event payload cannot set buyer ownership email
- signed callback is a trigger for `CHECK_STATUS`, not the source of ownership
- amount/currency mismatch becomes `review` and cannot grant access
- provider signature/reference verification fails closed
- event keys are deterministic/idempotent
- admin registry can render without WayForPay credentials; provider verification still fails closed when provider credentials are absent
- historical import window is capped at 31 days
- historical preview calculates Mini expiry from provider purchase time
- unknown historical product remains `review` with no entitlement
- digest mismatch blocks historical commit
- repeated historical commit does not duplicate or extend entitlement
- manual entitlement transfer preserves the financial `orders.buyer_email`
- admin transfer/revoke operations require the admin actor and audit reason
- reconciliation updates only after successful provider verification
- provider outage/invalid verification does not overwrite last verified state
- reconciliation limit is bounded and cron endpoint requires bearer secret

## Verified QA-isolation behavior

Synthetic registry contains exactly seven deterministic scenarios:

```text
qa-active-mini-base
qa-active-mini-pro
qa-expired-mini-base
qa-lifetime-atlas
qa-refunded
qa-chargeback
qa-review
```

Tests prove:
- every QA order uses `provider=test`
- no Auth identity is created for QA rows
- review has no entitlement
- lifetime Atlas has null expiry
- expired Mini is past its access deadline
- refund and chargeback first receive a grant then terminally revoke it
- seed is idempotent
- cleanup can delete only `provider=test` payment data and cannot delete WayForPay/control rows or Auth users

## Verified member/browser behavior

Chromium suite 14/14 proves:
- guest sees login; protected course source is absent from public static paths
- active member lands in account before protected Atlas is loaded
- protected Atlas lazy-boots all 28 lessons and all four protected artwork plates
- ordinary student cannot read admin content/payment registry
- notes sync and survive a normal cabinet reload
- deep-link behavior remains separate from normal cabinet reload behavior
- second student never sees first student notes
- concurrent note edit produces a conflict instead of silent overwrite
- practice clocks/breath guide pause on account navigation
- microphone stream is released after recording; local recording DB is account-scoped
- verified no-purchase account retains cabinet and never fetches protected course
- expired Mini shows explicit expired state and locked Atlas
- admin lands in student view, opens Admin explicitly, then Internal explicitly
- dashboard and Atlas have no horizontal overflow at 320/390/768/1440 widths
- a live synthetic refund while Atlas is open immediately clears protected lesson data and keeps the account shell
- no uncaught JavaScript exceptions in the suite

## Verified mechanics behavior

Mechanics suite 9/9 proves:
- one breath phase clock drives displayed phase and instructional anatomy
- airflow stops during holds and reverses on exhale
- pause freezes circle/caption/diaphragm together
- reset returns phase/counter/diaphragm to start
- switching anatomical plates preserves current guide position
- reduced-motion keeps instructional state but freezes moving anatomy
- phonation demonstration pauses when the document is hidden
- decorative animation toggles cannot disable phase text
- no uncaught mechanics exceptions

## Landing bridge evidence

Reference CI run: GitHub Actions `Academy Ledger Bridge CI` run `34431960224`, head `e9750e2f22e489d831efaa8d81b1e1e148403590`.

Commands:

```bash
npm test
git diff --check d62205117291eb3f6192df0b343311acb3476e18 HEAD
```

Result:
- callback tests: 9/9
- order-create tests: 4/4
- total: 13/13
- diff check: pass

Verified rollout contracts:
- `off` makes no Academy request
- `shadow` preserves current checkout/callback behavior on Academy bridge failure
- `required` blocks new checkout payload when ledger registration fails
- `required` callback ledger failure remains retryable and does not return WayForPay accept
- registration uses server-validated email/product/catalog price/reference
- provider-event bridge body never forwards callback buyer email

## Remaining live gates

Not verified by this document:
- cloud application of migrations `2026091001–1004`
- cloud read-back of RLS/RPC grants/product durations
- cloud QA seed/cleanup
- Vercel preview with real server-only secrets
- landing preview in `shadow` against the Atlas preview
- historical WayForPay preview against real transaction history
- custom SMTP / OTP template / CAPTCHA / Auth rate-limit configuration
- real OTP to `ceo@truevoice.academy`
- explicit live admin-role assignment after confirmed Auth identity
- real purchase flow
- real refund flow
- physical iPhone/Safari
- Firefox
- keyboard/screen-reader smoke
- privacy disclosure review
- backup/restore and incident-response exercise
- repository/history/old-deployment exposure decision
- production ledger `required` mode and production promotion

Any real purchase or refund must be preceded by explicit owner approval for the exact provider action/amount. No production secret belongs in Git, browser bundles or QA logs.
