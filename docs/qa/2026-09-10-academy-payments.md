# TrueVoice Academy 4.1 — QA evidence

Date: 2026-09-10

Branches:
- Atlas: `feat/academy-access-wayforpay-20260910`
- Landing: `feat/academy-ledger-bridge-20260910`

This document records automated local/CI verification plus the explicitly described cloud and preview verification below. It does not claim real OTP delivery, physical-device certification, a real WayForPay purchase/refund, historical customer import or production rollout.

## Verified Atlas baseline

Reference full code CI run: GitHub Actions `Academy Feature CI` run `34439247967`, head `3382d2681ad7f6dd9b36f95d1019b85efd4ab013`.

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
- unit/SQL: 80 passing, 0 failing
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
- a newer verified `review` suspends an existing Approved payment/access state
- an older/equal Approved replay cannot clear that newer review quarantine
- a fresh verified re-check of the same Approved provider fact can clear review quarantine when the verification observation is newer
- anonymous and ordinary student access to internal/admin content remains denied

## Verified payment-worker behavior

Automated tests prove:
- bridge bearer secret is required and compared in constant-time code paths
- `bridge-health` is GET-only, validates the bridge bearer and returns before payment-worker, database or WayForPay initialization; it is a zero-write connectivity preflight
- wrong bearer is denied even on the zero-write preflight
- payment API accepts JSON only and enforces a request-body cap for mutation actions
- trusted order registration uses server-supplied checkout ownership facts
- callback/provider-event payload cannot set buyer ownership email
- signed callback is a trigger for `CHECK_STATUS`, not the source of ownership
- amount/currency mismatch becomes `review` and cannot grant/retain access
- review is a quarantine state; stale Approved replay cannot silently restore it
- only a newer verified Approved observation may resolve review; terminal refund/chargeback still take precedence
- `CHECK_STATUS` state transitions are timestamped at verification time rather than reusing an old provider processing timestamp
- deterministic event keys still allow a later verified duplicate provider fact to clear quarantine without treating it as a stale replay
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
- an admin may classify only an unclassified historical `review`; classification preserves buyer email, amount, currency and purchase time, does not grant an entitlement, cannot be repeated, and writes an audit event
- the review-classification RPC is service-role-only and cannot be executed by anon/authenticated browser roles
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

Latest landing branch CI: GitHub Actions `Academy Ledger Bridge CI` run `34439966602`, head `118b326c694dd411d72cf5af3abf6efe7f059701`.

Commands:

```bash
npm test
git diff --check d62205117291eb3f6192df0b343311acb3476e18 HEAD
```

Result:
- callback tests: 10/10
- order-create tests: 6/6
- preview health / zero-write bridge probe: 5/5
- diff check: pass

Verified rollout contracts:
- `off` makes no Academy request
- `shadow` preserves current checkout/callback behavior on Academy bridge failure
- `required` blocks new checkout payload when ledger registration fails
- `required` callback ledger failure remains retryable and does not return WayForPay accept
- registration uses server-validated email/product/catalog price/reference
- provider-event bridge body never forwards callback buyer email
- preview-only health exposes only mode/configuration booleans and `bridgeReachable`; it never returns ledger URL, merchant ID, bridge secret, Vercel OIDC token or protection-bypass value
- production health route returns 404
- checkout and callback forward the short-lived Vercel Function `x-vercel-oidc-token` as `x-vercel-trusted-oidc-idp-token`
- Vercel Trusted Sources OIDC takes precedence over the long-lived Protection Bypass fallback
- optional Protection Bypass is sent only as `x-vercel-protection-bypass` when OIDC is absent
- neither OIDC nor bypass is placed in the bridge URL or JSON body
- bridge reachability is tested with GET `action=bridge-health`, so connectivity can be proven before any order/provider/database mutation

Vercel introduced Trusted Sources for Deployment Protection in 2026 and recommends short-lived OIDC for project-to-project access instead of sharing a long-lived Protection Bypass secret. The current landing implementation follows that preferred path while retaining the older bypass as a fallback.

## Cloud database verification

Project: True Voice Academy (`aqskidnelqmowzfkjieg`). Direct project-ref access is the canonical connector path for this work because the connector's generic `list_projects` view is currently authenticated against a different Supabase organization. No live checkout mode was changed during these database checks.

Applied additive schema/behavior migrations include:

```text
academy_access_policy_and_payment_state_v1
academy_account_without_entitlement_v1
academy_admin_payment_operations_v1
academy_qa_cleanup_v1
academy_review_quarantine_v1
academy_review_reverification_v1
academy_admin_classify_review_v1
```

Read-back proved:
- all 11 `tv_core` application tables have RLS enabled
- anonymous role has no executable `public.tv_*` RPC
- authenticated role is limited to intentional member RPCs: `tv_account`, `tv_authorize`, `tv_save_lesson`, `tv_save_profile`, `tv_set_resume`
- payment/admin RPCs are executable by `service_role`, not by ordinary authenticated/anonymous callers
- `mini-base`: Atlas / duration / 210 days
- `mini-pro`: Atlas / duration / 210 days
- `atlas-28d`: Atlas / lifetime
- `mini-upgrade`: no resource grant
- the confirmed owner identity `ceo@truevoice.academy` has the explicit `admin` role

Controlled verification migration `verify_academy_qa_lifecycle_20260910` exercised the production database RPCs with the seven `provider=test` scenarios. Assertions covered active Mini, expired Mini, lifetime Atlas, refund, chargeback and review/no-entitlement. It then invoked the official QA cleanup function. Post-cleanup read-back proved test payment rows were zero, synthetic Auth users were zero and WayForPay rows were unchanged.

`verify_academy_review_quarantine_20260910` exercised:

```text
approved -> newer review -> stale older approved replay
```

The order remained `review`; scoped cleanup removed the exact test rows.

`verify_academy_review_reverification_20260910` exercised the complementary recovery path: a fresh verified observation of the same Approved provider fact, with a newer verification time, may clear review quarantine while stale replay remains blocked. Cleanup again left zero `provider=test` rows and unchanged WayForPay rows.

`verify_academy_admin_classify_review_20260910` exercised an unclassified historical review. It proved:
- non-admin actor is rejected
- admin classification sets only the product classification
- buyer email, amount, currency and purchased-at remain unchanged
- order remains `review`
- no entitlement is granted by classification
- exactly one `review_classify` audit event is produced
- reclassification is rejected
- anon/authenticated cannot execute the classification RPC; `service_role` can
- exact QA order/events/audit rows are deleted before commit
- WayForPay row count remains unchanged

Final cloud post-check after all controlled verification:
- `provider=test` orders: 0
- `provider=test` payment events: 0
- `provider=test` entitlements: 0
- QA classification audit leftovers: 0
- WayForPay orders: 0 (unchanged; historical import has not been run)
- owner admin role: present
- lesson catalog: 28

The management SQL connector itself is read-only and could not execute service-role RPCs; controlled verification migrations were used so the checks ran with migration privileges while preserving runtime role boundaries. No runtime permission was widened.

One-shot verification SQL is tracked separately under `supabase/verification/` and is explicitly marked historical/non-replayable so cloud migration history remains auditable without treating QA scripts as normal schema migrations.

### Supabase security advisor review

After the DDL changes, Supabase security advisors report:
- RLS-enabled/no-policy notices on nine `tv_core` tables. This is intentional: `tv_core` is not an exposed Data API schema and direct table access is meant to fail closed; access is through narrow RPCs/service-role operations.
- warnings that the five authenticated member RPCs are `SECURITY DEFINER`. This is also intentional for the current design; each RPC derives identity from the authenticated session and the automated isolation suite covers cross-user denial and role escalation.
- leaked-password protection is disabled. Password login is not part of the planned Academy v1 flow (OTP/magic-link). If password auth is ever enabled, this warning becomes a launch blocker and the protection must be enabled first.

Reference remediation docs from the advisor:
- RLS no-policy lint: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- authenticated SECURITY DEFINER lint: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- password protection: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

## Measured preview state

Both Vercel feature deployments are READY. No production target was promoted.

Atlas preview health (`4.1.0-core`) returned HTTP 200 with no-store headers and a Secure/HttpOnly host-only CSRF cookie before the manual configuration step. Measured configuration:

```text
configured=true
bundleReady=true
emailEnabled=false
captchaSiteKey=empty
serviceRoleConfigured=false
wayForPayConfigured=false
bridgeConfigured=false
cronConfigured=false
```

The capability map exists only in preview/dev and contains booleans only; production health omits it. A guest session request returned `401 login_required`. The current Atlas deployment containing zero-write `bridge-health` is READY. Some protected preview fetches are intercepted by Vercel Authentication before reaching the function, so they are not counted as app-level smoke evidence.

Landing preview was previously measured before any manual Academy env changes as:

```text
mode=off
ledgerUrlConfigured=false
ledgerSecretConfigured=false
wayForPayConfigured=true
```

This proves the landing preview already has its WayForPay configuration, but the Academy ledger bridge was intentionally inactive. The newer deployment adds `bridgeReachable` and Trusted Sources support; an external re-fetch through the connector was intercepted by Vercel Authentication, so no unmeasured configuration value is inferred from that interception. No checkout or provider action was invoked during these measurements.

The current Vercel connector does not expose project environment-variable mutation or Trusted Sources configuration. Therefore the next rollout step is a deployment-config gate in Vercel project settings rather than an application-code defect.

## Remaining live gates

Not verified by this document:
- configure Atlas Preview `SUPABASE_SERVICE_ROLE_KEY`, `WAYFORPAY_MERCHANT_ACCOUNT`, `WAYFORPAY_SECRET_KEY`, `ATLAS_PAYMENT_BRIDGE_SECRET`, `CRON_SECRET`
- preferred: Atlas Vercel Settings → Deployment Protection → Trusted Sources, authorize `truevoice-landing` Preview → Atlas Preview
- configure landing Preview `ACADEMY_LEDGER_URL`, `ACADEMY_LEDGER_SECRET`, then set `ACADEMY_LEDGER_MODE=shadow`
- fallback only if Trusted Sources is unavailable: configure `ACADEMY_LEDGER_VERCEL_BYPASS`
- re-read landing preview health and require `bridgeReachable=true` before any order/provider operation
- authenticated admin payment API on the protected preview after those env values exist
- shadow bridge order registration test without charging a card
- historical WayForPay preview against real transaction history
- custom SMTP / OTP template / CAPTCHA / Auth rate-limit configuration
- real OTP to `ceo@truevoice.academy`
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
