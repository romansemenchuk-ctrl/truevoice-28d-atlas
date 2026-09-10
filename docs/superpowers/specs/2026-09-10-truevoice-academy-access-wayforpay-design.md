# TrueVoice Academy — Access, Cabinet and WayForPay Design

Date: 2026-09-10
Status: approved design candidate; implementation not started from this spec
Repository: `romansemenchuk-ctrl/truevoice-28d-atlas`
Baseline branch: `feat/academy-qa-20260908`
Supabase project: `aqskidnelqmowzfkjieg` (`True Voice Academy`)

## 1. Purpose

Turn TrueVoice Atlas from a standalone protected application into the first member product inside a shared TrueVoice Academy account.

A buyer should be able to:

1. purchase a TrueVoice product through WayForPay;
2. sign in with the same verified email address;
3. see the products and access periods attached to that identity;
4. enter Atlas only while an applicable entitlement is active;
5. continue progress, notes and bookmarks across devices;
6. keep voice recordings local to the device in v1.

The owner account `ceo@truevoice.academy` is an explicit administrator. Admin capability must never be inferred from client state, email string alone, first-user status, or browser metadata.

## 2. Existing foundation to preserve

The TrueVoice Supabase project already contains the `tv_core` application schema, including:

- `products`
- `resources`
- `product_resources`
- `orders`
- `entitlements`
- `member_roles`
- `profiles`
- `lesson_catalog`
- `lesson_state`
- `payment_events`
- `audit_events`

The project already has the public RPC boundary for member authorization/account/progress and all application tables are RLS-enabled. The current product catalog includes:

- `mini-base`
- `mini-pro`
- `mini-upgrade`
- `atlas-28d`

The `atlas` resource already exists. The current administrator identity is a confirmed Supabase Auth user and has an explicit `admin` row in `tv_core.member_roles`.

This design reuses these tables and does **not** introduce a parallel buyer registry.

The registry visible to administrators is a projection over `orders + entitlements + auth identity + profiles`, not a duplicate table.

## 3. Scope

### In scope

- shared Academy sign-in and purchase-gated access;
- student-first cabinet;
- separate admin cabinet;
- WayForPay ingestion for new payments;
- historical WayForPay synchronization/import;
- refund and chargeback reconciliation;
- per-product access duration rules;
- safe entitlement claim by verified email;
- synthetic QA purchase records, clearly separated from financial records;
- cloud synchronization of Atlas progress, notes and bookmarks;
- support/recovery states;
- security controls and audit requirements;
- production launch gates.

### Out of scope for this design

- a complete redesign of the TrueVoice marketing landing;
- cloud upload of voice recordings;
- community/chat features;
- subscriptions/recurring billing;
- affiliate accounting;
- a new clinical anatomy pack;
- replacing the current 28 lesson source content;
- changing the existing SendPulse customer journey except where payment delivery integration must safely coexist with it.

Anatomy Lab visual refinement remains a separate follow-up stream. The member shell must be compatible with the existing improved mechanics branch and must not regress its timers, breath pacing, focus mode or protected artwork delivery.

## 4. Core model

### 4.1 Identity

Supabase Auth is the only member identity system.

- Login is email OTP or magic-link based.
- A verified Auth email is the canonical member email.
- There is no application password table.
- Browser-local flags never grant access or admin capability.
- Changing the member email is not a self-service v1 operation because purchase ownership is email-bound. It requires a controlled support/admin flow.

### 4.2 Product vs resource

`products` represent things sold.

`resources` represent things the account can access.

`product_resources` maps a product to one or more resource grants. Access policy belongs to the mapping, not the product as a whole, because a future product may grant different resources for different durations.

Add to `tv_core.product_resources`:

- `access_mode`: `duration | lifetime`
- `access_days`: positive integer for `duration`, `NULL` for `lifetime`

No row means the product does not grant that resource.

Initial Atlas policy:

| Product | Atlas mapping | Access policy |
| --- | --- | --- |
| `mini-base` | yes | `duration`, 210 days |
| `mini-pro` | yes | `duration`, 210 days |
| `mini-upgrade` | no standalone Atlas grant | none |
| `atlas-28d` | yes | `lifetime` |

The business definition of “7 months” for Mini is deliberately fixed to **210 days**, not PostgreSQL calendar-month arithmetic.

### 4.3 Orders

`tv_core.orders` is the durable purchase ledger.

Each real WayForPay order stores:

- provider = `wayforpay`;
- provider reference / `orderReference`;
- normalized buyer email;
- mapped product ID;
- amount in minor units;
- currency;
- current financial status;
- provider transaction/purchase timestamp;
- verification timestamp.

`(provider, reference)` must be unique.

Import time must not replace purchase time. Access windows are derived from the provider transaction time.

### 4.4 Entitlements

`tv_core.entitlements` is the authorization source of truth.

For an approved order and each mapped resource:

- `valid_from` = verified provider purchase timestamp;
- duration grant: `valid_until = valid_from + access_days`;
- lifetime grant: `valid_until = NULL`;
- refund/chargeback: `revoked_at` is set and access becomes inactive;
- `user_id` may initially be null until the verified buyer claims the purchase.

An entitlement is active only if all are true:

1. source order is approved;
2. entitlement is not revoked;
3. current time is on/after `valid_from`;
4. `valid_until` is null or current time is before it;
5. product/resource mapping remains enabled according to the agreed policy.

A historical Mini order older than 210 days is still imported into the ledger, but its entitlement is already expired.

## 5. Entitlement claiming

The buyer logs in with Supabase Auth using the purchase email.

After Auth verifies identity, the server/database claims any matching unclaimed entitlement atomically:

`orders.buyer_email == authenticated verified email`

Rules:

- claim only after Supabase has verified control of the email;
- never accept a requested `user_id` from the browser as ownership proof;
- never claim an entitlement for a different email automatically;
- a claimed entitlement remains linked to its user even on later logins;
- ambiguous ownership or requested email transfer goes to an admin support flow and is audit logged.

The account may exist without an active entitlement. In that case the member can see the account shell and purchase/access status, but Atlas content remains locked.

## 6. Roles and views

### 6.1 Student is always the default UI

Every authenticated member, including an administrator, lands in the student experience.

Student navigation:

- Home
- Atlas
- Practice / tools
- Journal
- My products
- Profile

No “Internal” switch is rendered for ordinary students.

### 6.2 Admin capability

Admin is determined only by an explicit row in `tv_core.member_roles` linked to the verified Auth user.

The owner identity is:

`ceo@truevoice.academy`

The admin account is allowed to enter Atlas without a commercial purchase, but still defaults to student presentation.

Only an authenticated admin receives the Admin navigation entry and can call admin-only endpoints/RPCs.

Admin areas:

- Users / members
- Orders
- Entitlements / access
- WayForPay history sync
- Reconciliation
- Review queue
- QA/test records
- Internal methodology/content
- Audit trail

Admin-only methodology must not be bundled into student payloads and hidden with CSS. It is fetched only after server-side authorization.

## 7. Student cabinet

### 7.1 Home

Show:

- greeting / member name;
- Continue Practice CTA;
- last lesson;
- 28-day progress;
- completed lessons;
- practice minutes;
- streak;
- active product/access summary.

The member is not forced into a calendar lock. Once access is active, all 28 lessons are available and the student may move at their own pace.

### 7.2 Atlas

Four-week map with lesson states:

- available;
- in progress;
- complete;
- bookmarked.

Expired/revoked users see the Atlas entry in a locked state rather than losing the entire account.

### 7.3 My Products

Each product card shows:

- product title;
- financial/access status appropriate for the member;
- active-until date when finite;
- lifetime label when applicable;
- associated accessible resources.

The UI should not expose raw payment-provider internals unless required for support.

### 7.4 Profile

Minimum v1:

- display name;
- verified email, read-only;
- products/access;
- export of progress/notes;
- logout;
- support contacts.

Use current TrueVoice brand assets and contacts from the current `7d.truevoice.academy` landing repository, including the current logo assets and official support contact data.

### 7.5 Progress sync

Cloud sync covers:

- completed lesson;
- completed steps;
- notes;
- bookmark;
- last/resume lesson;
- progress metadata needed by the dashboard.

Continue using revision/version conflict detection. A stale tab must not silently overwrite newer notes.

### 7.6 Voice recordings

Voice recordings remain local in v1.

- IndexedDB storage is scoped to the verified account ID;
- recordings are never treated as synced cloud progress;
- account UI states clearly that recordings stay on the current device;
- logout/account switch stops microphone activity and isolates local recordings by member identity.

## 8. Visual system

The Academy member UI should inherit the current TrueVoice visual language rather than look like a generic SaaS dashboard.

References approved by the owner:

- deep black and wine/crimson surfaces;
- warm red organic glow;
- restrained gold accent;
- neural/biological linework used as an atmospheric layer;
- Sun/Moon/axis symbolism;
- strong editorial typography;
- generous negative space;
- calm learning surfaces inside a more expressive surrounding environment.

The UI must not become a dense sci-fi cockpit. Mystical/organic animation supports orientation and emotional identity; it must not compete with instructional text, timers or accessibility.

Motion rules:

- ambient effects are slow and non-essential;
- `prefers-reduced-motion` disables decorative motion without hiding information;
- hidden tabs pause nonessential animation and practice clocks as appropriate;
- state-changing controls use deterministic, testable transitions;
- anatomy motion and breath timing share one clock where they depict the same breathing phase.

## 9. New WayForPay payments

The existing TrueVoice landing already has a server-side WayForPay callback and SendPulse fulfillment. Do not introduce a competing public callback without migration.

Recommended rollout:

1. keep the current WayForPay `serviceUrl` and signature verification path;
2. after signature validation, persist the verified payment into the TrueVoice Academy database through a narrowly defined trusted server path;
3. create/update order + payment event + entitlements transactionally/idempotently;
4. keep SendPulse as a separate best-effort fulfillment concern;
5. acknowledge WayForPay only after the Academy payment event is durably recorded or after the callback reaches a defined recoverable state that reconciliation can prove.

The callback must be safe to replay.

A duplicate `Approved` must not duplicate orders, grants or extend the access window.

A later refund/chargeback must revoke the entitlement. A replayed old `Approved` event must never resurrect a newer refund/chargeback state.

The payment bridge is server-only. WayForPay secrets and privileged Supabase credentials must never enter browser bundles.

## 10. Payment state precedence

The financial state machine is monotonic with terminal negative states.

At minimum:

- `pending`
- `approved`
- `declined`
- `refunded`
- `chargeback`
- `review`

`refunded` and `chargeback` cannot be overwritten by a replayed older `approved` event.

Every provider event is deduplicated with a stable event key/fingerprint and is written to `payment_events` before or with the order transition.

Unknown/mismatched events go to `review`; they do not issue access.

## 11. Historical WayForPay import

WayForPay is the source of truth for historical purchase reconstruction.

Admin flow:

1. select/import a provider date window;
2. fetch transaction history server-side;
3. normalize transaction data;
4. map to known TrueVoice products;
5. validate reference, email, amount, currency and status;
6. produce a dry-run report;
7. require explicit admin confirmation;
8. write orders/events/entitlements idempotently;
9. audit the committed import.

Dry-run classes:

- new approved purchase;
- already imported;
- duplicate;
- expired entitlement after import;
- refunded/chargeback;
- unknown product;
- amount/currency conflict;
- malformed email/reference;
- needs manual review.

Importing the same provider window twice must produce no duplicate grants or changed access dates.

## 12. Product mapping

New TrueVoice checkouts should encode an unambiguous product key in the server-generated payment/order reference or trusted checkout metadata.

Current known mapping:

- landing plan `base` → `mini-base`;
- landing plan `pro` → `mini-pro`;
- landing plan `upgrade` → `mini-upgrade`.

`atlas-28d` gets its own explicit checkout key when direct Atlas sales are enabled.

For older transactions that predate the new reference format:

- exact deterministic mapping rules may use known product name/price/currency combinations;
- the mapping table must be reviewable and tested;
- if the transaction does not match exactly, mark it `review`;
- do not guess the closest product and do not grant access “just in case.”

## 13. Reconciliation

Webhook delivery provides immediate updates. Scheduled reconciliation is the safety net.

Run reconciliation at least daily for known/eligible WayForPay transactions, with an admin-triggered manual option.

Reconciliation detects:

- missed callbacks;
- provider status changes;
- refund;
- chargeback;
- mismatched amount/currency/reference;
- inconsistent local state.

It must be idempotent and use the same payment-state transition rules as the callback and historical import.

A failure to reach WayForPay must not automatically revoke valid access. The status remains unchanged and the failure is surfaced operationally.

## 14. Synthetic QA registry

The shared production-like TrueVoice project may contain a small explicitly synthetic dataset for QA, capped at 10 scenarios.

Synthetic purchase records use:

`provider = test`

They must never use `provider = wayforpay` and must never be counted as revenue.

Recommended scenarios:

1. active `mini-base`;
2. active `mini-pro`;
3. expired `mini-base`;
4. lifetime `atlas-28d`;
5. refunded purchase;
6. chargeback purchase;
7. review/no entitlement;
8. account with no purchase.

Do not create password bypasses or fake production authentication.

For manual preview login, create Auth identities only for addresses the owner can actually receive through a controlled alias/catch-all. Otherwise synthetic identities stay in automated/local fixtures and synthetic order rows may exist unclaimed for admin UI testing.

Provide one admin cleanup action/script that removes `provider=test` orders and their dependent test entitlements/events without affecting real purchases.

## 15. Error and recovery states

### Purchase not found

The member may authenticate but sees:

- “Access not found”;
- Check purchase / retry action;
- support contact.

Do not tell the user they never purchased if the database/provider is temporarily unavailable.

### Payment email differs from login email

No automatic merge.

Admin can transfer/claim entitlement only through a deliberate flow with:

- source purchase;
- destination verified Auth identity;
- reason;
- confirmation;
- audit event.

### Access expired

Keep the account usable.

Member can see profile, products and expiration status; protected Atlas content remains locked.

### Refund/chargeback

Keep account identity/profile. Revoke only the affected entitlement.

### Provider/database outage

Display temporary service error and retry path. Do not mutate the last verified entitlement solely because a remote verification attempt failed.

### Conflict between tabs/devices

Progress and notes use revision/version checks. Surface a merge/reload decision rather than last-write-wins data loss.

## 16. Security boundary

Mandatory controls:

- Supabase service-role/secret keys never shipped to the browser;
- WayForPay merchant secret remains server-side;
- public client uses only the project’s publishable key;
- `tv_core` remains outside directly exposed client tables where feasible;
- RLS remains enabled;
- authenticated public RPCs derive `user_id` from Auth context, never request payload;
- admin reads/writes require explicit DB role check;
- internal course payload is server-filtered;
- mutations enforce JSON, same-origin/approved Origin and CSRF/session rules used by the Academy server layer;
- OTP endpoints are rate-limited;
- real public login is gated on custom SMTP, correct OTP template, CAPTCHA and verified rate-limit behavior;
- logs must not contain full auth tokens, secrets, card data or raw sensitive payment fields;
- privileged imports/transfers/revocations write an audit event.

## 17. Audit trail

Extend/use `tv_core.audit_events` for operationally important actions.

Record at least:

- historical import commit;
- manual entitlement transfer;
- manual revoke/restore;
- QA dataset create/cleanup;
- product-access policy change;
- reconciliation action that changes access.

Audit metadata may include IDs/references and change summaries, but not payment card data or credentials.

## 18. Privacy and data retention

Member data stored in cloud v1:

- verified account identity;
- profile name;
- purchase/access metadata;
- lesson completion/progress;
- notes/bookmarks;
- operational audit metadata.

Voice recordings are local-only.

The implementation must update privacy disclosures before production if the existing policy does not already describe account/progress storage.

## 19. Testing requirements

### Database / authorization

Verify:

- RLS on all app tables;
- student A cannot read/write student B state;
- admin role is explicit;
- student cannot fetch internal content;
- active duration grant works;
- expired duration grant fails;
- lifetime grant works;
- revoked/refunded/chargeback grant fails;
- entitlement claim requires verified matching email;
- admin can enter member experience without a commercial entitlement.

### Payments

Verify:

- valid signed callback;
- invalid signature rejected;
- unknown order/reference handling;
- duplicate callback is idempotent;
- approved → refund;
- approved → chargeback;
- old approved replay after refund does not restore access;
- wrong amount/currency cannot grant access;
- unknown product goes to review;
- historical import twice is idempotent;
- historical Mini access starts at purchase time, not import time;
- 210-day expiration rule;
- lifetime Atlas rule;
- `mini-upgrade` does not create a standalone Atlas entitlement.

### Browser

Verify:

- guest sees sign-in shell, not protected content;
- no-entitlement member sees account/locked state;
- active student sees Atlas;
- expired student sees locked Atlas but retains account;
- admin lands in student view and can explicitly enter Admin;
- all 28 lessons work;
- progress sync across two sessions/devices;
- revision conflict UX;
- profile update;
- logout/account switch;
- microphone teardown and account-scoped local recordings;
- 320/390/768/1440 layouts;
- keyboard and reduced-motion behavior;
- no uncaught JS exceptions.

### Production smoke

Before launch, complete one controlled real WayForPay purchase end-to-end:

`checkout → provider approval → durable order → entitlement → verified login → Atlas access`

Then validate refund/reconciliation using a safe provider-supported procedure before relying on automatic revocation.

## 20. Operational launch gates

Do not promote the new member/payment flow to production until all of these are satisfied:

1. custom SMTP configured and real OTP delivery verified;
2. CAPTCHA and Auth rate limits configured/tested;
3. `ceo@truevoice.academy` admin access rechecked in production;
4. product/resource access policy migration applied and read back;
5. WayForPay credentials configured only in trusted server environments;
6. new-payment callback/bridge verified idempotent;
7. historical import dry-run reviewed before commit;
8. reconciliation path operational;
9. synthetic QA records clearly tagged and cleanup verified;
10. current public repository/history and previous public deployments reviewed because new authorization cannot retract already-published historical copies;
11. privacy/support copy updated as necessary;
12. physical iPhone/Safari plus Firefox smoke tests performed;
13. production backup/restore and basic incident procedure documented.

## 21. Repository and service boundaries

### `truevoice-landing`

Owns:

- checkout UI;
- order creation/signing;
- current WayForPay service callback;
- current SendPulse fulfillment;
- the first trusted handoff of verified payment status into Academy.

### `truevoice-28d-atlas`

Owns:

- member/student UI;
- Atlas application;
- account/progress UX;
- Admin UI;
- protected lesson/internal content APIs;
- entitlement-aware authorization;
- historical-sync/reconciliation admin surfaces and shared Academy access logic, unless payment worker deployment is intentionally centralized elsewhere during implementation.

### Supabase `True Voice Academy`

Owns:

- Auth identity;
- product/resource catalog;
- orders/payment-event ledger;
- entitlements;
- roles;
- member profile;
- lesson progress/state;
- audit trail.

There must be one canonical payment/entitlement state machine even if API endpoints live across two deployments.

## 22. Implementation sequencing

This design is intended to be implemented in staged, reversible increments:

1. reconcile current DB migration history and add per-resource access policy;
2. finish account/session/locked-state behavior on the latest Academy branch;
3. add deterministic entitlement claim and admin member/order views;
4. implement idempotent trusted new-payment ingestion alongside the existing landing callback;
5. implement historical WayForPay dry-run/import;
6. implement scheduled/manual reconciliation;
7. add synthetic QA scenarios and cleanup;
8. run full database/API/browser suite;
9. configure SMTP/CAPTCHA and run real-login QA;
10. run controlled real payment production smoke;
11. only then merge/promote.

## 23. Success criteria

The feature is complete when:

- a real approved Mini buyer can sign in with the purchase email and receives exactly 210 days of Atlas access from purchase time;
- an Atlas direct buyer receives lifetime Atlas access;
- an upgrade-only order cannot independently unlock Atlas;
- refunds/chargebacks remove affected access without deleting the account;
- repeated callbacks/imports cannot duplicate or extend access;
- historical WayForPay orders can be dry-run, reviewed and imported safely;
- student is the default experience for every account;
- internal/admin content is inaccessible to non-admins at the server/database boundary;
- `ceo@truevoice.academy` can enter Admin through the explicit role;
- progress/notes synchronize without silent conflict overwrite;
- synthetic QA records are distinguishable and removable;
- no secret, admin flag or purchase-unlock switch is trusted from browser state;
- production login/payment flows pass the launch gates above.
