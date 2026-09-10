# TrueVoice Academy Access + WayForPay Implementation Plan v2

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved shared TrueVoice Academy member system: purchase-gated Atlas access, locked-but-usable accounts, explicit admin operations, historical WayForPay import, idempotent payment ingestion, and reconciliation.

**Architecture:** Supabase Auth remains identity; `tv_core` remains the single product/order/entitlement/progress model. Add additive PostgreSQL migrations and service-role-only public RPCs for payment mutations; keep member RPCs authenticated/RLS-derived. The Atlas Vercel deployment owns Academy/admin/payment-worker APIs. The existing `truevoice-landing` remains the live WayForPay callback and forwards trusted order/payment facts to Atlas through a server-only bridge.

**Tech Stack:** Node.js 22.x; Vercel; Supabase Auth/Postgres/RLS; `@supabase/supabase-js` 2.116.0; `@supabase/ssr` 0.12.7; PGlite 0.5.8; Playwright/Chromium; WayForPay `TRANSACTION_LIST`, `CHECK_STATUS`, and current service callback.

**Spec:** `docs/superpowers/specs/2026-09-10-truevoice-academy-access-wayforpay-design.md`

**Supersedes:** `docs/superpowers/plans/2026-09-10-truevoice-academy-access-wayforpay.md`. Execute this v2 file; the earlier draft remains only as history.

## Global Constraints

- Atlas baseline: `feat/academy-qa-20260908`; preserve all 28 original lesson texts and the currently tested breath/anatomy/focus mechanics.
- Supabase: `aqskidnelqmowzfkjieg` (`True Voice Academy`). Existing cloud migrations are already initialized; apply new additive migrations only after reading migration history.
- Access: `mini-base` = 210 days; `mini-pro` = 210 days; `atlas-28d` = lifetime; `mini-upgrade` = no standalone Atlas grant.
- `valid_from` / `valid_until` are immutable grant snapshots. Later catalog-policy or product-enable changes cannot silently rewrite existing entitlements.
- Authenticated members may retain an account with no active Atlas entitlement. Only protected course/art/practice writes remain access-gated.
- Student UI is default even for admin. `ceo@truevoice.academy` is admin only because `tv_core.member_roles` says so.
- Voice recordings stay local and account-scoped.
- Synthetic payment data uses `provider='test'`, at most seven payment scenarios, no synthetic cloud Auth identities, and one isolated cleanup path.
- Service-role, merchant, bridge, cron, and CAPTCHA secrets stay server-only; no raw card fields in app storage/logs.
- Existing landing `serviceUrl` remains unchanged during migration; ledger rollout is `off → shadow → required`.
- Production promotion requires real SMTP/OTP/CAPTCHA, historical dry-run review, reconciliation, device/browser QA, exposure/privacy review, and an explicitly approved real-payment smoke.

## File Map

### Atlas repository

Create:
- `supabase/migrations/2026091001_access_policy_and_payment_state.sql`
- `supabase/migrations/2026091002_account_without_entitlement.sql`
- `supabase/migrations/2026091003_admin_payment_operations.sql`
- `supabase/migrations/2026091004_qa_cleanup.sql`
- `server/wayforpay.cjs`
- `server/service-supabase.cjs`
- `server/payments.cjs`
- `server/payments-api.cjs`
- `server/reconcile.cjs`
- `server/qa-registry.cjs`
- `api/payments.js`
- `api/reconcile.js`
- `js/academy-admin.js`
- `tests/wayforpay.test.cjs`
- `tests/payments.test.cjs`
- `tests/payments-api.test.cjs`
- `tests/admin-payments.test.cjs`
- `tests/reconciliation.test.cjs`
- `tests/qa-registry.test.cjs`
- `docs/qa/2026-09-10-academy-payments.md`

Modify:
- `server/academy.cjs`, `.env.example`, `vercel.json`, `package.json`, `README.md`
- `js/academy.js`, `academy-shell.html`, `css/academy.css`, `css/academy-interaction.css`, `scripts/build.mjs`
- `tests/db-fixture.cjs`, `tests/database.test.cjs`, `tests/api.test.cjs`, `tests/local-server.cjs`, `tests/members-browser.cjs`

### Landing repository

Create:
- `lib/academy-ledger.js`
- `api/wayforpay-create.test.js`

Modify:
- `api/wayforpay-create.js`
- `api/wayforpay-callback.js`
- `api/wayforpay-callback.test.js`
- `.env.example`
- `package.json`

---

### Task 1: Database Access Policy + Atomic Payment State

**Files:**
- Create: `supabase/migrations/2026091001_access_policy_and_payment_state.sql`
- Modify: `tests/db-fixture.cjs`
- Modify: `tests/database.test.cjs`

**Interfaces:**
- `public.tv_register_order(p_provider,p_reference,p_buyer_email,p_product_id,p_product_hint,p_amount_minor,p_currency,p_purchased_at,p_event_key,p_payload_hash) -> jsonb`, service-role only.
- `public.tv_apply_payment_status(p_provider,p_reference,p_status,p_observed_at,p_event_key,p_payload_hash) -> jsonb`, service-role only.
- `public.tv_reconcile_candidates(p_limit) -> jsonb`, service-role only.
- `tv_core.can_access(resource)` checks only recorded entitlement/order validity; it does not depend on present catalog enablement.

- [ ] **Step 1: Write failing policy/payment tests**

Add to `tests/database.test.cjs`:

```js
await t.test('access policy is 210 days / lifetime / no upgrade grant',async()=>{
  const rows=(await db.query(`select product_id,resource_key,access_mode,access_days
    from tv_core.product_resources order by product_id`)).rows;
  assert.deepEqual(rows,[
    {product_id:'atlas-28d',resource_key:'atlas',access_mode:'lifetime',access_days:null},
    {product_id:'mini-base',resource_key:'atlas',access_mode:'duration',access_days:210},
    {product_id:'mini-pro',resource_key:'atlas',access_mode:'duration',access_days:210}
  ]);
});

await t.test('terminal refund cannot be resurrected by old approved replay',async()=>{
  await db.exec('reset role');
  await db.query(`select public.tv_register_order($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[
    'wayforpay','order-terminal','terminal@example.test','mini-base',null,1500,'USD',
    '2026-01-01T00:00:00Z','registered-order-terminal','hash-register'
  ]);
  await db.query(`select public.tv_apply_payment_status($1,$2,$3,$4,$5,$6)`,[
    'wayforpay','order-terminal','approved','2026-01-01T00:01:00Z','approved-event','hash-approved'
  ]);
  await db.query(`select public.tv_apply_payment_status($1,$2,$3,$4,$5,$6)`,[
    'wayforpay','order-terminal','refunded','2026-01-02T00:00:00Z','refund-event','hash-refund'
  ]);
  await db.query(`select public.tv_apply_payment_status($1,$2,$3,$4,$5,$6)`,[
    'wayforpay','order-terminal','approved','2026-01-01T00:01:00Z','approved-replay','hash-approved-replay'
  ]);
  assert.equal((await scalar(db,"select status from tv_core.orders where reference='order-terminal'")).status,'refunded');
});

await t.test('disabling a sold product does not revoke issued entitlement',async()=>{
  await db.exec("reset role;update tv_core.products set enabled=false where id='mini-base'");
  await claims(db,A,SA);
  assert.equal((await scalar(db,"select tv_core.can_access('atlas') ok")).ok,true);
});
```

Update `tests/db-fixture.cjs` so seeded orders have deterministic `purchased_at`; seeded active Mini entitlements have future `valid_until`.

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- --test-name-pattern="access policy|terminal refund|disabling a sold product"
```

Expected: FAIL because columns/RPCs do not exist and current access depends on `products.enabled`.

- [ ] **Step 3: Implement additive schema**

Migration must:

```sql
ALTER TABLE tv_core.product_resources
  ADD COLUMN access_mode text,
  ADD COLUMN access_days integer;

UPDATE tv_core.product_resources
SET access_mode=CASE WHEN product_id='atlas-28d' THEN 'lifetime' ELSE 'duration' END,
    access_days=CASE WHEN product_id='atlas-28d' THEN NULL ELSE 210 END;

ALTER TABLE tv_core.product_resources
  ALTER COLUMN access_mode SET NOT NULL,
  ADD CONSTRAINT product_resources_access_chk CHECK(
    (access_mode='duration' AND access_days>0) OR
    (access_mode='lifetime' AND access_days IS NULL));

ALTER TABLE tv_core.orders
  ALTER COLUMN product_id DROP NOT NULL,
  ADD COLUMN product_hint text,
  ADD COLUMN purchased_at timestamptz,
  ADD COLUMN status_observed_at timestamptz,
  ADD COLUMN last_reconciled_at timestamptz;

UPDATE tv_core.orders
SET purchased_at=created_at,
    status_observed_at=coalesce(verified_at,created_at)
WHERE purchased_at IS NULL;
ALTER TABLE tv_core.orders ALTER COLUMN purchased_at SET NOT NULL;

ALTER TABLE tv_core.payment_events
  ADD COLUMN status text,
  ADD COLUMN observed_at timestamptz,
  ADD COLUMN payload_hash text;

ALTER TABLE tv_core.audit_events
  ADD COLUMN detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD CONSTRAINT audit_detail_object_chk CHECK(jsonb_typeof(detail)='object');
```

Replace `tv_core.can_access` so it requires: member/user match, resource key, non-revoked entitlement, validity window, source order `approved`, and `verified_at IS NOT NULL`. Do not join `products.enabled` or the current `product_resources` row.

`tv_register_order` validates immutable identity. Exact retries return the same order. A duplicate `(provider,reference)` with changed buyer/product/amount/currency/purchase time raises `22023`. Unknown historical product may be registered with `product_id=NULL`, but can never grant access.

`tv_apply_payment_status` implements one state machine:

```text
pending/declined/review -> approved -> refunded|chargeback
refunded|chargeback never -> approved
```

On first known-product approval, issue mapped entitlements using the current mapping once. Duration uses `purchased_at + access_days * interval '1 day'`; lifetime uses `NULL`. `ON CONFLICT(order_id,resource_key) DO NOTHING` freezes grant dates. Refund/chargeback sets `revoked_at`.

Revoke payment RPCs from `PUBLIC,anon,authenticated`; grant only `service_role`.

- [ ] **Step 4: Run full Node/PGlite tests**

```bash
npm test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/2026091001_access_policy_and_payment_state.sql tests/db-fixture.cjs tests/database.test.cjs
git commit -m "feat: add immutable Academy payment state"
```

---

### Task 2: Account Shell Without Active Entitlement

**Files:**
- Create: `supabase/migrations/2026091002_account_without_entitlement.sql`
- Modify: `server/academy.cjs`
- Modify: `tests/database.test.cjs`
- Modify: `tests/api.test.cjs`

**Interfaces:**
- `public.tv_account() -> {user,access:{atlas:boolean},purchases,lessons}` for every valid verified Auth session.
- `public.tv_authorize()` remains strict Atlas gate.
- `tv_save_profile` works for locked members; `tv_save_lesson` and `tv_set_resume` remain Atlas-gated.

- [ ] **Step 1: Write failing locked-account tests**

```js
await claims(db,C,SC);
const v=(await scalar(db,'select public.tv_account() v')).v;
assert.equal(v.user.id,C);
assert.equal(v.access.atlas,false);
assert.deepEqual(v.purchases,[]);
await assert.rejects(db.query('select public.tv_authorize()'),/access denied/);
```

After refund, assert `tv_account()` still works and `access.atlas===false`; `tv_authorize()` must fail.

In `tests/api.test.cjs`, make a `blocked` fake RPC return a valid `tv_account` object with `access.atlas:false`, but return `42501` for `tv_authorize`. Assert `session` = 200 and `content` = 403.

- [ ] **Step 2: Run and confirm failure**

```bash
npm test -- --test-name-pattern="locked|without purchase|refund"
```

- [ ] **Step 3: Implement database/API semantics**

`tv_account()`:

1. requires only `tv_core.member_id()`;
2. claims unclaimed entitlements whose `orders.buyer_email` equals verified lowercased Auth email;
3. creates profile if absent;
4. returns `access.atlas = tv_core.can_access('atlas')`;
5. returns order/product/access history using left joins so pending/review/expired/refunded purchases remain visible;
6. returns only current user lesson state.

`tv_save_profile` requires live member identity but not Atlas access. Keep lesson/resume/content/art gated.

`server/academy.cjs` must not sign out a successfully verified user merely because `access.atlas=false`.

- [ ] **Step 4: Run full tests**

```bash
npm test
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/2026091002_account_without_entitlement.sql server/academy.cjs tests/database.test.cjs tests/api.test.cjs
git commit -m "feat: keep locked TrueVoice accounts usable"
```

---

### Task 3: Pure WayForPay Adapter

**Files:**
- Create: `server/wayforpay.cjs`
- Create: `tests/wayforpay.test.cjs`

**Interfaces:**
- `hmacMd5(secret,parts)`
- `transactionListRequest(config,{dateBegin,dateEnd})`
- `checkStatusRequest(config,reference)`
- `verifyStatusResponse(config,payload)`
- `providerStatus(payload)`
- `productFromReference(reference)`
- `normalizeHistoryTransaction(tx,rules)`

- [ ] **Step 1: Write exact provider-contract tests**

```js
test('TRANSACTION_LIST signature',()=>{
  const r=wfp.transactionListRequest({merchantAccount:'m',secret:'s'},{dateBegin:1700000000,dateEnd:1700086400});
  assert.equal(r.transactionType,'TRANSACTION_LIST');
  assert.equal(r.merchantSignature,wfp.hmacMd5('s',['m','1700000000','1700086400']));
});

test('CHECK_STATUS signature',()=>{
  const r=wfp.checkStatusRequest({merchantAccount:'m',secret:'s'},'tv-base-1-a');
  assert.equal(r.merchantSignature,wfp.hmacMd5('s',['m','tv-base-1-a']));
});

test('modern product mapping is exact',()=>{
  assert.equal(wfp.productFromReference('tv-base-1-a'),'mini-base');
  assert.equal(wfp.productFromReference('tv-pro-1-a'),'mini-pro');
  assert.equal(wfp.productFromReference('tv-upgrade-1-a'),'mini-upgrade');
  assert.equal(wfp.productFromReference('tv-atlas-1-a'),'atlas-28d');
  assert.equal(wfp.productFromReference('legacy-1'),null);
});

test('refundAmount overrides Approved',()=>{
  assert.equal(wfp.providerStatus({transactionStatus:'Approved',refundAmount:'1.00'}),'refunded');
});
```

Verify signed status responses using field order `merchantAccount;orderReference;amount;currency;authCode;cardPan;transactionStatus;reasonCode`.

- [ ] **Step 2: Run and confirm failure**

```bash
node --test tests/wayforpay.test.cjs
```

- [ ] **Step 3: Implement provider adapter**

Use `crypto.createHmac('md5',secret)` only here. Parse monetary strings into integer minor units without binary floating-point multiplication of untrusted values. `fetchTransactionList` and `fetchCheckStatus` POST to `https://api.wayforpay.com/api` with 10-second abort timeout and never log raw provider payloads.

Mapping order: modern reference first; then exact legacy rules parsed from `WAYFORPAY_LEGACY_RULES_JSON` entries `{productId,amountMinor,currency,referencePattern?}`. Zero or multiple exact matches => `productId:null`, `classification:'review'`.

- [ ] **Step 4: Run tests**

```bash
node --test tests/wayforpay.test.cjs
```

- [ ] **Step 5: Commit**

```bash
git add server/wayforpay.cjs tests/wayforpay.test.cjs
git commit -m "feat: add WayForPay provider adapter"
```

---

### Task 4: Service-Role Payment Worker + Bridge Endpoint

**Files:**
- Create: `server/service-supabase.cjs`
- Create: `server/payments.cjs`
- Create: `server/payments-api.cjs`
- Create: `api/payments.js`
- Create: `tests/payments.test.cjs`
- Create: `tests/payments-api.test.cjs`
- Modify: `.env.example`
- Modify: `vercel.json`

**Interfaces:**
- `serviceClient(config)` fails closed if service key absent.
- `registerTrustedOrder(input)` calls `tv_register_order`.
- `verifyAndApplyReference(reference)` uses `CHECK_STATUS`, verifies response, amount/currency/reference, then calls `tv_apply_payment_status`.
- `POST /api/payments?action=register-order` and `provider-event` require constant-time Bearer `ATLAS_PAYMENT_BRIDGE_SECRET`.

- [ ] **Step 1: Write failing boundary/worker tests**

Cover wrong bridge secret (403), body-size cap, wrong amount/currency no grant, duplicate event idempotency, and callback-email tampering. The worker must use the email registered at checkout; `provider-event` must not accept an email ownership field.

- [ ] **Step 2: Run and confirm failure**

```bash
node --test tests/payments.test.cjs tests/payments-api.test.cjs
```

- [ ] **Step 3: Implement service isolation**

`server/service-supabase.cjs` creates a non-persisting service client only from `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; no source fallback.

`payments-api.cjs` rules:
- POST+JSON only for bridge actions;
- 128 KiB body cap;
- `Cache-Control: private, no-store`;
- constant-time Bearer comparison;
- sanitized error codes;
- `register-order` accepts validated server checkout identity: reference, email, product, amount minor, currency, order timestamp;
- `provider-event` revalidates WayForPay signature, then independently executes `CHECK_STATUS` before any access-changing update.

Add to Atlas `.env.example`:

```text
SUPABASE_SERVICE_ROLE_KEY=
WAYFORPAY_MERCHANT_ACCOUNT=
WAYFORPAY_SECRET_KEY=
ATLAS_PAYMENT_BRIDGE_SECRET=
WAYFORPAY_LEGACY_RULES_JSON=[]
```

- [ ] **Step 4: Verify tests/build/secrets**

```bash
npm run build
npm test
node --test tests/wayforpay.test.cjs tests/payments.test.cjs tests/payments-api.test.cjs
! grep -R "SUPABASE_SERVICE_ROLE_KEY\|WAYFORPAY_SECRET_KEY" dist
```

- [ ] **Step 5: Commit**

```bash
git add server/service-supabase.cjs server/payments.cjs server/payments-api.cjs api/payments.js tests/payments.test.cjs tests/payments-api.test.cjs .env.example vercel.json
git commit -m "feat: add trusted Academy payment worker"
```

---

### Task 5: Bridge `truevoice-landing` Checkout and Existing Callback

**Repository:** `romansemenchuk-ctrl/truevoice-landing`

**Files:**
- Create: `lib/academy-ledger.js`
- Create: `api/wayforpay-create.test.js`
- Modify: `api/wayforpay-create.js`
- Modify: `api/wayforpay-callback.js`
- Modify: `api/wayforpay-callback.test.js`
- Modify: `.env.example`
- Modify: `package.json`

**Interfaces:**
- `ledgerCall(action,payload)` honors `ACADEMY_LEDGER_MODE=off|shadow|required`.
- Order-create sends trusted email/product/amount/reference before widget response.
- Callback sends reference/status facts, never callback email as ownership.

- [ ] **Step 1: Write tests for all rollout modes**

Assert:
- `off` makes no Academy request;
- `shadow` logs/returns bridge failure internally but preserves current checkout/callback behavior;
- `required` order-registration failure blocks new checkout and callback persistence failure returns retryable 5xx rather than WayForPay accept;
- bridge registration uses server-validated checkout email;
- callback bridge body contains no buyer email field.

- [ ] **Step 2: Run and confirm failure**

```bash
npm test
node api/wayforpay-create.test.js
```

- [ ] **Step 3: Implement bridge**

Environment:

```text
ACADEMY_LEDGER_MODE=shadow
ACADEMY_LEDGER_URL=https://<academy-host>/api/payments
ACADEMY_LEDGER_SECRET=<32+ random server secret>
```

`wayforpay-create.js` registers the pending order after its current email/phone/plan/price/reference validation and before returning widget payload. `wayforpay-callback.js` keeps the current public WayForPay signature path and SendPulse behavior; after signature validation it calls `provider-event`. In `required`, Academy persistence must succeed before signed `accept`.

- [ ] **Step 4: Run landing tests**

```bash
npm test
node api/wayforpay-create.test.js
```

- [ ] **Step 5: Commit in landing repo**

```bash
git add lib/academy-ledger.js api/wayforpay-create.js api/wayforpay-create.test.js api/wayforpay-callback.js api/wayforpay-callback.test.js .env.example package.json
git commit -m "feat: bridge WayForPay into TrueVoice Academy"
```

---

### Task 6: Admin Registry + Historical Import + Manual Access Operations

**Files:**
- Create: `supabase/migrations/2026091003_admin_payment_operations.sql`
- Create: `tests/admin-payments.test.cjs`
- Modify: `server/payments.cjs`
- Modify: `server/payments-api.cjs`

**Interfaces:**
- Admin role checked through authenticated Supabase session before service-role calls.
- `registry` GET.
- `history-preview` POST `{dateBegin,dateEnd}` max 31 days.
- `history-commit` POST `{dateBegin,dateEnd,digest}`.
- `reconcile-reference` POST `{reference}`.
- `transfer-entitlement` POST `{orderId,resourceKey,targetUserId,reason}`.
- `set-revoked` POST `{orderId,resourceKey,revoked,reason}`.

- [ ] **Step 1: Write failing admin tests**

Prove student gets 403; >31-day preview gets 400; unknown historical transaction classifies `review`; Mini preview calculates 210-day expiry from provider purchase time; digest mismatch blocks commit; same history commit twice creates no duplicate/extended entitlement.

- [ ] **Step 2: Run and confirm failure**

```bash
node --test tests/admin-payments.test.cjs
```

- [ ] **Step 3: Implement service-only admin RPCs**

Migration adds public service-role-only RPCs for registry, entitlement transfer/revoke/restore, and audit writes. Transfer requires a confirmed `auth.users` destination UUID and changes entitlement ownership only; it never rewrites the financial `orders.buyer_email`. Restore is refused for `refunded`/`chargeback` sources. All manual mutations include actor/reason/detail audit metadata.

- [ ] **Step 4: Implement preview → digest → re-fetch → commit**

Preview fetches `TRANSACTION_LIST`, normalizes, maps modern references then exact legacy rules, and returns classifications without card PAN/authCode/raw payload. Digest is SHA-256 of normalized preview.

Commit re-fetches the same time window and recomputes digest. Mismatch returns 409. Access-changing candidates are rechecked with signed `CHECK_STATUS`; writes use Task 1 RPCs. Unknown product persists as review with null product and no entitlement.

- [ ] **Step 5: Run tests**

```bash
npm test
node --test tests/admin-payments.test.cjs tests/payments.test.cjs tests/wayforpay.test.cjs
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/2026091003_admin_payment_operations.sql server/payments.cjs server/payments-api.cjs tests/admin-payments.test.cjs
git commit -m "feat: add Academy payment administration"
```

---

### Task 7: Daily + Manual Reconciliation

**Files:**
- Create: `server/reconcile.cjs`
- Create: `api/reconcile.js`
- Create: `tests/reconciliation.test.cjs`
- Modify: `vercel.json`
- Modify: `.env.example`

**Interfaces:**
- `runReconciliation({limit:50})`.
- Cron requires `Authorization: Bearer ${CRON_SECRET}`.
- Provider/network/verification failure never mutates last verified financial/access state.

- [ ] **Step 1: Write failure/refund tests**

Test: provider outage preserves approved status/entitlement; verified refund revokes; valid unchanged Approved updates `last_reconciled_at`; bad signature changes nothing; wrong cron secret = 403.

- [ ] **Step 2: Run and confirm failure**

```bash
node --test tests/reconciliation.test.cjs
```

- [ ] **Step 3: Implement reconciliation**

Fetch at most 50 candidates ordered by oldest/null reconciliation time. For each: `CHECK_STATUS`, verify signature/reference/amount/currency, apply via the shared payment RPC, then mark reconciliation time. Collect errors; do not downgrade on outage.

Add daily Vercel cron for `/api/reconcile`; add `CRON_SECRET` to `.env.example`.

- [ ] **Step 4: Run tests**

```bash
node --test tests/reconciliation.test.cjs
npm test
```

- [ ] **Step 5: Commit**

```bash
git add server/reconcile.cjs api/reconcile.js tests/reconciliation.test.cjs vercel.json .env.example
git commit -m "feat: reconcile WayForPay access daily"
```

---

### Task 8: Synthetic QA Registry + Isolated Cleanup

**Files:**
- Create: `supabase/migrations/2026091004_qa_cleanup.sql`
- Create: `server/qa-registry.cjs`
- Create: `tests/qa-registry.test.cjs`
- Modify: `server/payments-api.cjs`

**Interfaces:**
- `qa-seed` admin-only.
- `qa-cleanup` admin-only.
- No cloud Auth users are created.

- [ ] **Step 1: Write exact scenario test**

Seven deterministic payment refs:

```js
[
 'qa-active-mini-base',
 'qa-active-mini-pro',
 'qa-expired-mini-base',
 'qa-lifetime-atlas',
 'qa-refunded',
 'qa-chargeback',
 'qa-review'
]
```

Assert every order provider is `test`; review has no entitlement; lifetime has null expiry; expired Mini is past; refund/chargeback revoked. Seed one control WayForPay row and prove cleanup preserves it.

- [ ] **Step 2: Run and confirm failure**

```bash
node --test tests/qa-registry.test.cjs
```

- [ ] **Step 3: Implement deterministic seed/cleanup**

Use `@example.test` buyer emails and the production payment RPCs. Expired Mini has purchase date >210 days ago. Refund/chargeback flows issue then terminally revoke. `2026091004_qa_cleanup.sql` provides service-only cleanup that deletes `payment_events → entitlements → orders` where provider is exactly `test`, then audits the cleanup.

- [ ] **Step 4: Run tests**

```bash
node --test tests/qa-registry.test.cjs
npm test
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/2026091004_qa_cleanup.sql server/qa-registry.cjs tests/qa-registry.test.cjs server/payments-api.cjs
git commit -m "feat: add removable Academy QA registry"
```

---

### Task 9: Locked Student Cabinet + Separate Admin Cabinet

**Files:**
- Create: `js/academy-admin.js`
- Modify: `js/academy.js`, `academy-shell.html`, `css/academy.css`, `css/academy-interaction.css`, `scripts/build.mjs`
- Modify: `tests/local-server.cjs`, `tests/members-browser.cjs`

**Interfaces:**
- Session account renders before protected course load.
- Protected Atlas boots lazily only when `account.access.atlas===true` (admin receives true through DB admin authorization).
- `window.createAcademyAdmin({root,request,onOpenInternal,onClose})`.

- [ ] **Step 1: Extend synthetic browser fixtures**

Use A active, B separate active, C explicit admin/no purchase, D verified/no purchase, E expired Mini. Browser tests assert D/E see cabinet + locked state and content endpoint 403; active sees Atlas; C lands student dashboard, sees Admin nav, can explicitly open internal methodology; ordinary student has no Admin nav.

Keep existing tests for 28 lessons, protected images, note conflicts, microphone teardown, mechanics, and widths.

- [ ] **Step 2: Run browser test and confirm failure**

```bash
npm run build
node tests/members-browser.cjs
```

- [ ] **Step 3: Refactor Academy entry flow**

`js/academy.js` sequence:

```text
session -> render account shell -> if access active, lazy-load content/modules on Atlas action
                                -> if access inactive, never fetch protected content
```

Locked members retain profile/products/support/logout. Verified email is read-only. Product cards show active/expired/refunded/review/lifetime and finite expiry where present.

Admin remains student view by default. Render `#open-admin` only for role admin. Remove ordinary Internal controls; `academy-admin.js` has an explicit internal launch that fetches `admin-content` before switching Atlas mode.

Admin module renders registry, history window preview/commit, reconcile reference, test seed/cleanup, transfer, revoke/restore, and internal launch. It never receives provider secrets or raw card fields.

- [ ] **Step 4: Apply approved visual system**

Black/deep-wine surfaces, crimson organic glow, restrained gold, current TrueVoice logo/contact data, clear locked/review/test badges, generous learning whitespace. Decorative motion cannot move hit targets and is disabled by reduced-motion.

- [ ] **Step 5: Run all UI/mechanics tests**

```bash
npm run build
npm test
node tests/members-browser.cjs
node tests/mechanics-browser.cjs
```

Expected: PASS at 320/390/768/1440 with no uncaught JS errors.

- [ ] **Step 6: Commit**

```bash
git add js/academy.js js/academy-admin.js academy-shell.html css/academy.css css/academy-interaction.css scripts/build.mjs tests/local-server.cjs tests/members-browser.cjs
git commit -m "feat: add locked student and admin cabinets"
```

---

### Task 10: Full Regression Evidence

**Files:**
- Modify: `package.json`, `README.md`
- Create: `docs/qa/2026-09-10-academy-payments.md`
- Modify landing: `package.json`

- [ ] **Step 1: Add Atlas aggregate scripts**

```json
"test:browser":"node tests/members-browser.cjs",
"test:mechanics":"node tests/mechanics-browser.cjs",
"test:all":"npm run build && npm test && npm run test:browser && npm run test:mechanics"
```

Landing `npm test` must execute both callback and order-create tests.

- [ ] **Step 2: Run exact regression commands**

Atlas:

```bash
npm ci
npm run test:all
npm audit --omit=dev
git diff --check
```

Landing:

```bash
npm test
git diff --check
```

Required proof: duration/lifetime/upgrade rules; immutable grant; locked shell; A/B isolation; explicit admin; invalid/duplicate callbacks; terminal negative replay; amount/currency mismatch; import idempotency; outage-preserves-state; QA cleanup isolation; 28 lessons/artwork; note conflict; local recordings; responsive/reduced-motion.

- [ ] **Step 3: Write QA evidence without overclaiming**

Record commands, PASS counts, commit SHAs, synthetic fixture caveats, and remaining live gates in `docs/qa/2026-09-10-academy-payments.md`. Real OTP, physical devices, real purchase/refund are not marked verified until performed.

- [ ] **Step 4: Commit**

```bash
git add package.json README.md docs/qa/2026-09-10-academy-payments.md
git commit -m "test: document Academy payment verification"
```

Commit landing package/test changes separately.

---

### Task 11: Cloud Migration + Shadow Rollout + Production Gates

**Files:** no new source file unless verification discovers a defect.

- [ ] **Step 1: Read cloud migration history**

Confirm existing Academy migrations in project `aqskidnelqmowzfkjieg`. Apply only 2026091001–1004 through controlled Supabase migrations. Read back RLS, RPC grants, and policy rows:

```text
mini-base atlas duration 210
mini-pro atlas duration 210
atlas-28d atlas lifetime NULL
mini-upgrade: no atlas row
```

- [ ] **Step 2: QA seed then cleanup**

Use admin `qa-seed`; prove ≤7 `provider=test` orders and zero synthetic Auth users. Exercise admin states. Run `qa-cleanup`; prove zero test-provider rows and preserved real/control WayForPay rows.

- [ ] **Step 3: Deploy Atlas preview with server secrets only**

Set service-role, merchant, bridge, cron credentials in Vercel server env. Keep `ATLAS_EMAIL_ENABLED=false`. Verify anonymous protected endpoints remain 401/403 and downloaded assets contain no secrets.

- [ ] **Step 4: Connect landing in `shadow` mode**

Set `ACADEMY_LEDGER_MODE=shadow`, ledger URL, bridge secret. Run non-financial signed fixture requests against previews. Confirm shadow failure never breaks existing checkout.

- [ ] **Step 5: Historical WayForPay dry-run**

Preview small date windows first. Owner reviews every review/conflict and access date before any commit. No historical commit happens merely because the endpoint works.

- [ ] **Step 6: Configure real login**

Configure custom SMTP, OTP template, CAPTCHA secret/site key, Auth rate limits; prove OTP to `ceo@truevoice.academy`; recheck explicit admin row before enabling `ATLAS_EMAIL_ENABLED=true`.

- [ ] **Step 7: Controlled real purchase requires explicit spend approval**

At execution time ask for approval of the exact test amount before initiating any financial transaction. Then verify:

```text
checkout -> pending ledger -> Approved callback -> durable event -> entitlement -> verified login -> Atlas
```

- [ ] **Step 8: Refund test requires explicit approval**

Use only provider-supported refund procedure after owner confirms that order may be refunded. Verify account remains, entitlement revokes, replayed Approved cannot restore.

- [ ] **Step 9: Complete launch evidence**

Physical iPhone/Safari, Firefox, keyboard/screen-reader smoke, privacy disclosure, repository/old-deployment exposure decision, backup/restore + incident notes, historical-import review, cron reconciliation.

- [ ] **Step 10: Move ledger to `required` and promote only after all gates pass**

In required mode, new checkout registration failure stops issuance of the checkout payload and callback persistence failure stays retryable. Record final deployment SHAs/URLs and smoke evidence. Never commit production secrets.

---

## Self-Review

- Spec coverage maps identity, access policy, locked member shell, admin/internal boundary, payment ingestion, historical import, reconciliation, QA registry, error recovery, audit, progress/local voice behavior, security and production gates to explicit tasks.
- No duplicate buyer registry is introduced; registry views derive from Auth + existing orders/entitlements/profiles.
- New payment ownership is captured at trusted order creation, not from unsigned callback email.
- All access-changing WayForPay paths converge on one pair of database RPCs; callback/import/reconciliation do not implement separate state machines.
- Historical import re-fetches and re-verifies before commit; unknown product stays review/no entitlement.
- Task 1 terminal-state test registers the order before applying payment status.
- Task 8 always uses a dedicated fourth additive migration; it never edits an already-committed migration.
- Placeholder scan: no implementation placeholders are intentionally left; live secrets and payment amounts remain execution-time configuration/approval values rather than source constants.
