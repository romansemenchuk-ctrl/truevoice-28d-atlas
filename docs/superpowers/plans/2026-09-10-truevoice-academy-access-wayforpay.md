# TrueVoice Academy Access + WayForPay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a secure TrueVoice Academy member flow where verified WayForPay purchases issue deterministic Atlas entitlements, members can sign in and retain a useful locked account when access expires, and `ceo@truevoice.academy` receives an explicit admin surface for payments, access, QA records, and internal methodology.

**Architecture:** Keep Supabase Auth + the existing `tv_core` schema as the identity/access foundation. Add only additive database migrations, service-role-only payment RPCs, a dedicated Atlas payment worker, and a narrow server-to-server bridge from the existing `truevoice-landing` WayForPay flow. The browser continues to use the publishable Supabase key and protected Academy API; privileged payment/database credentials never enter client bundles.

**Tech Stack:** Node.js 22.x, Vercel serverless functions, Supabase Auth/Postgres/RLS, `@supabase/supabase-js` 2.116.0, `@supabase/ssr` 0.12.7, PGlite 0.5.8 for SQL tests, Playwright/Chromium for browser QA, WayForPay API (`TRANSACTION_LIST`, `CHECK_STATUS`, existing service callback).

**Spec:** `docs/superpowers/specs/2026-09-10-truevoice-academy-access-wayforpay-design.md`

## Global Constraints

- Baseline Atlas branch is `feat/academy-qa-20260908`; implementation must preserve the 28 original lesson texts and current synchronized anatomy/breath mechanics.
- Supabase project is exactly `aqskidnelqmowzfkjieg` (`True Voice Academy`). Reconcile existing cloud migration history before applying new DDL; never rerun the already-applied `academy_core_v1` CREATE migration against the initialized cloud project.
- `mini-base` and `mini-pro` grant Atlas for exactly **210 days from provider purchase time**. `atlas-28d` grants lifetime Atlas access. `mini-upgrade` creates no standalone Atlas entitlement.
- Entitlement dates are historical snapshots. Later product-policy changes or `products.enabled=false` must not rewrite or revoke already-issued valid grants.
- Student UI is the default for every authenticated user, including administrators. Admin/internal data is server-authorized and never hidden-only in client payloads.
- `ceo@truevoice.academy` is an explicit admin through `tv_core.member_roles`; never infer admin from email text in browser code.
- Voice recordings stay local and account-scoped in IndexedDB for v1.
- Synthetic QA payment rows use `provider='test'`, are capped below 10 scenarios, are never counted as revenue, and are removable without touching WayForPay rows.
- `SUPABASE_SERVICE_ROLE_KEY`, `WAYFORPAY_SECRET_KEY`, bridge secrets, cron secrets, Auth tokens, and card data must never be emitted to `dist/`, logs, browser JSON, source constants, or public screenshots.
- Existing `truevoice-landing` remains the only live WayForPay `serviceUrl` during rollout. Introduce the Academy ledger in `off → shadow → required` stages rather than replacing the callback abruptly.
- No production merge/promotion until SMTP/OTP/CAPTCHA, historical-import review, reconciliation, physical-device QA, repository/deployment exposure review, and a controlled real payment smoke are complete.

---

## File / Responsibility Map

### `romansemenchuk-ctrl/truevoice-28d-atlas`

- Create `supabase/migrations/2026091001_access_policy_and_payment_state.sql` — additive catalog/payment schema, immutable grant policy, service-only payment RPCs.
- Create `supabase/migrations/2026091002_account_without_entitlement.sql` — account shell semantics, entitlement claim, profile access for locked members.
- Create `server/wayforpay.cjs` — pure WayForPay signing, verification, normalization, reference/product mapping.
- Create `server/service-supabase.cjs` — service-role Supabase client used only by payment/admin workers.
- Create `server/payments.cjs` — trusted order registration, provider verification, import/reconciliation orchestration.
- Create `server/payments-api.cjs` — bridge/admin HTTP boundary and authorization.
- Create `server/qa-registry.cjs` — deterministic synthetic purchase scenarios.
- Create `api/payments.js` — Vercel entrypoint for bridge/admin payment actions.
- Create `api/reconcile.js` — CRON_SECRET-protected scheduled reconciliation.
- Create `js/academy-admin.js` — admin cabinet/payment UI only.
- Modify `server/academy.cjs` — account session remains available without active entitlement; course/art stay gated.
- Modify `js/academy.js`, `academy-shell.html`, `css/academy.css`, `css/academy-interaction.css` — locked/student/admin states and navigation.
- Modify `.env.example`, `vercel.json`, `README.md`, `package.json` — worker configuration, cron, test commands, rollout documentation.
- Modify `tests/db-fixture.cjs`, `tests/database.test.cjs`, `tests/api.test.cjs`, `tests/local-server.cjs`, `tests/members-browser.cjs`.
- Create `tests/wayforpay.test.cjs`, `tests/payments.test.cjs`, `tests/payments-api.test.cjs`, `tests/reconciliation.test.cjs`.

### `romansemenchuk-ctrl/truevoice-landing`

- Create `lib/academy-ledger.js` — internal bridge client with `off|shadow|required` rollout modes.
- Modify `api/wayforpay-create.js` — register a trusted pending order before/alongside checkout response.
- Modify `api/wayforpay-callback.js` — forward verified callback state to Academy without trusting callback email for ownership.
- Modify `api/wayforpay-callback.test.js`, create `api/wayforpay-create.test.js`, modify `.env.example`, `package.json`.

---

### Task 1: Add Immutable Product-Access Policy and Atomic Payment Ledger RPCs

**Files:**
- Create: `supabase/migrations/2026091001_access_policy_and_payment_state.sql`
- Modify: `tests/db-fixture.cjs`
- Modify: `tests/database.test.cjs`

**Interfaces:**
- Produces: `tv_core.product_resources.access_mode`, `access_days`.
- Produces: `tv_core.orders.purchased_at`, `status_observed_at`, `last_reconciled_at`, nullable `product_id`, `product_hint`.
- Produces: `public.tv_register_order(...) -> jsonb`, service-role only.
- Produces: `public.tv_apply_payment_status(...) -> jsonb`, service-role only.
- Produces: `public.tv_reconcile_candidates(integer) -> jsonb`, service-role only.
- Changes: `tv_core.can_access(resource text)` to authorize from recorded order + entitlement state only, not current catalog enablement/mapping.

- [ ] **Step 1: Write failing SQL tests for product policy snapshots and terminal payment states**

Add explicit subtests to `tests/database.test.cjs`:

```js
await t.test('catalog policy is 210 days / lifetime / no upgrade grant', async()=>{
  const rows=(await db.query(`select product_id,resource_key,access_mode,access_days
    from tv_core.product_resources order by product_id`)).rows;
  assert.deepEqual(rows,[
    {product_id:'atlas-28d',resource_key:'atlas',access_mode:'lifetime',access_days:null},
    {product_id:'mini-base',resource_key:'atlas',access_mode:'duration',access_days:210},
    {product_id:'mini-pro',resource_key:'atlas',access_mode:'duration',access_days:210}
  ]);
});

await t.test('issued entitlement survives later product disable', async()=>{
  await db.exec("reset role; update tv_core.products set enabled=false where id='mini-base'");
  await claims(db,A,SA);
  assert.equal((await scalar(db,"select tv_core.can_access('atlas') ok")).ok,true);
});

await t.test('old approved replay cannot resurrect refund', async()=>{
  await db.exec('reset role');
  await db.query(`select public.tv_apply_payment_status($1,$2,$3,$4,$5,$6)`,[
    'wayforpay','order-terminal','refunded',new Date().toISOString(),'refund-event','hash-refund'
  ]);
  await db.query(`select public.tv_apply_payment_status($1,$2,$3,$4,$5,$6)`,[
    'wayforpay','order-terminal','approved',new Date().toISOString(),'approved-replay','hash-approved'
  ]);
  assert.equal((await scalar(db,"select status from tv_core.orders where reference='order-terminal'")).status,'refunded');
});
```

Update fixture data so seeded Mini entitlements have a known `purchased_at` and future `valid_until`.

- [ ] **Step 2: Run database tests and verify the new assertions fail**

Run:

```bash
npm test -- --test-name-pattern="database isolation|catalog policy|issued entitlement|approved replay"
```

Expected: FAIL because access-policy columns and payment RPCs do not exist and current `can_access` still depends on `products.enabled`.

- [ ] **Step 3: Implement the additive migration**

The migration must include these constraints and seeds:

```sql
ALTER TABLE tv_core.product_resources
  ADD COLUMN access_mode text,
  ADD COLUMN access_days integer,
  ADD CONSTRAINT product_resources_access_mode_chk
    CHECK (access_mode IN ('duration','lifetime')),
  ADD CONSTRAINT product_resources_access_days_chk
    CHECK ((access_mode='duration' AND access_days>0) OR
           (access_mode='lifetime' AND access_days IS NULL));

UPDATE tv_core.product_resources
SET access_mode=CASE WHEN product_id='atlas-28d' THEN 'lifetime' ELSE 'duration' END,
    access_days=CASE WHEN product_id='atlas-28d' THEN NULL ELSE 210 END;

ALTER TABLE tv_core.product_resources
  ALTER COLUMN access_mode SET NOT NULL;

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

Replace `tv_core.can_access(text)` so existing access checks only `e.user_id`, validity, revocation, source order status/verification, and resource key. Do not join `products.enabled` or `product_resources` during authorization.

Implement `public.tv_register_order(...)` with this contract:

```text
(provider, reference, buyer_email, product_id nullable, product_hint nullable,
 amount_minor, currency, purchased_at, event_key, payload_hash)
```

It must normalize/validate the immutable order identity, insert a `pending` order if absent, insert a deduplicated payment event, and return the existing order unchanged on an identical retry. Identity mismatch for an existing `(provider,reference)` raises `22023` and never rewrites buyer/product/amount/currency.

Implement `public.tv_apply_payment_status(...)` with this contract:

```text
(provider, reference, status, observed_at, event_key, payload_hash)
```

Rules inside the single SQL transaction:

```text
pending/declined/review -> approved -> refunded or chargeback
refunded/chargeback -> never back to approved
unknown product + approved provider result -> local status review, no entitlement
approved known product -> insert entitlement once using the current mapping snapshot
refund/chargeback -> set revoked_at on affected entitlement
```

For duration grants calculate `valid_until = purchased_at + access_days * interval '1 day'`; lifetime stores `NULL`. `ON CONFLICT(order_id,resource_key) DO NOTHING` prevents retries or future policy changes from extending existing grants.

`public.tv_reconcile_candidates(p_limit integer)` returns at most 50 `wayforpay` orders ordered by `last_reconciled_at NULLS FIRST, purchased_at`, excluding `declined`, `refunded`, and `chargeback` only when business policy says they no longer need verification; include `approved` so later provider refunds can be discovered.

Revoke all three RPCs from `PUBLIC, anon, authenticated`; grant execute only to `service_role`.

- [ ] **Step 4: Run SQL tests**

Run:

```bash
npm test
```

Expected: all existing database/API/build tests plus new policy/payment assertions PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/2026091001_access_policy_and_payment_state.sql tests/db-fixture.cjs tests/database.test.cjs
git commit -m "feat: add immutable access policy and payment ledger"
```

---

### Task 2: Keep the Account Usable Without Active Atlas Access

**Files:**
- Create: `supabase/migrations/2026091002_account_without_entitlement.sql`
- Modify: `tests/database.test.cjs`
- Modify: `tests/api.test.cjs`
- Modify: `server/academy.cjs`

**Interfaces:**
- `public.tv_account() -> { user, access:{atlas:boolean}, purchases, lessons }`
- `public.tv_authorize()` remains the content/art authorization gate.
- `public.tv_save_profile()` becomes available to a valid authenticated member even when Atlas is expired/revoked.
- `content`, `art`, `lesson`, and `resume` remain Atlas-entitlement-gated.

- [ ] **Step 1: Change tests to express the approved locked-account semantics**

Replace the old “no purchase denied” expectation with:

```js
await claims(db,C,SC);
await t.test('verified member without purchase gets account shell but no Atlas access',async()=>{
  const v=(await scalar(db,'select public.tv_account() v')).v;
  assert.equal(v.user.id,C);
  assert.equal(v.access.atlas,false);
  assert.deepEqual(v.purchases,[]);
  await assert.rejects(db.query('select public.tv_authorize()'),/access denied/);
});
```

Add a refund expectation:

```js
await t.test('refund keeps account but locks Atlas',async()=>{
  const v=(await scalar(db,'select public.tv_account() v')).v;
  assert.equal(v.access.atlas,false);
  assert.equal(v.purchases[0].active,false);
  await assert.rejects(db.query('select public.tv_authorize()'),/access denied/);
});
```

In `tests/api.test.cjs`, make `session` succeed for a blocked member while `content` still returns 403.

- [ ] **Step 2: Run tests and confirm failure**

```bash
npm test -- --test-name-pattern="account shell|refund keeps account|missing purchase"
```

Expected: FAIL because current `tv_account()` raises on missing access.

- [ ] **Step 3: Implement `tv_account` and profile semantics**

Create/replace `public.tv_account()` so it:

1. requires a live verified Auth session through `tv_core.member_id()`;
2. lowercases the verified Auth email;
3. atomically claims unclaimed entitlements where `orders.buyer_email` matches that email;
4. inserts the profile row if absent;
5. returns `access.atlas = tv_core.can_access('atlas')` instead of raising;
6. returns purchases with historical status/expiry even when inactive;
7. returns lesson state only for the current member.

Keep `public.tv_authorize()` unchanged as the strict Atlas-content boundary.

Replace `public.tv_save_profile()` so it requires a valid `member_id()` but does not require `can_access('atlas')`. Keep `tv_set_resume` and `tv_save_lesson` entitlement-gated.

Update `server/academy.cjs` so `verify-code` treats a successful `tv_account()` as a valid login even with `access.atlas=false`. `content`, `admin-content`, and `art` continue to call `tv_authorize()`.

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/2026091002_account_without_entitlement.sql tests/database.test.cjs tests/api.test.cjs server/academy.cjs
git commit -m "feat: keep locked Academy accounts accessible"
```

---

### Task 3: Implement a Pure WayForPay Provider Adapter

**Files:**
- Create: `server/wayforpay.cjs`
- Create: `tests/wayforpay.test.cjs`

**Interfaces:**
- `hmacMd5(secret, parts: string[]) -> string`
- `transactionListRequest(config,{dateBegin,dateEnd}) -> object`
- `checkStatusRequest(config,reference) -> object`
- `verifyStatusResponse(config,payload) -> boolean`
- `providerStatus(payload) -> pending|approved|declined|refunded|chargeback`
- `productFromReference(reference) -> mini-base|mini-pro|mini-upgrade|atlas-28d|null`
- `normalizeHistoryTransaction(tx,rules) -> normalized transaction`

- [ ] **Step 1: Write provider-contract tests**

Create tests covering the official signature strings:

```js
const {test}=require('node:test');
const assert=require('node:assert/strict');
const wfp=require('../server/wayforpay.cjs');
const c={merchantAccount:'merchant',secret:'secret'};

test('TRANSACTION_LIST signs merchantAccount;dateBegin;dateEnd',()=>{
  const r=wfp.transactionListRequest(c,{dateBegin:1700000000,dateEnd:1700086400});
  assert.equal(r.transactionType,'TRANSACTION_LIST');
  assert.equal(r.apiVersion,2);
  assert.equal(r.merchantSignature,wfp.hmacMd5('secret',['merchant','1700000000','1700086400']));
});

test('CHECK_STATUS signs merchantAccount;orderReference',()=>{
  const r=wfp.checkStatusRequest(c,'tv-base-1-x');
  assert.equal(r.merchantSignature,wfp.hmacMd5('secret',['merchant','tv-base-1-x']));
});

test('reference mapping is exact and upgrade grants no direct Atlas product',()=>{
  assert.equal(wfp.productFromReference('tv-base-1-x'),'mini-base');
  assert.equal(wfp.productFromReference('tv-pro-1-x'),'mini-pro');
  assert.equal(wfp.productFromReference('tv-upgrade-1-x'),'mini-upgrade');
  assert.equal(wfp.productFromReference('tv-atlas-1-x'),'atlas-28d');
  assert.equal(wfp.productFromReference('legacy-123'),null);
});

test('refund amount wins over Approved',()=>{
  assert.equal(wfp.providerStatus({transactionStatus:'Approved',refundAmount:'15.00'}),'refunded');
});
```

Also test constant-time response signature verification using the WayForPay response field order:
`merchantAccount;orderReference;amount;currency;authCode;cardPan;transactionStatus;reasonCode`.

- [ ] **Step 2: Run and verify failure**

```bash
node --test tests/wayforpay.test.cjs
```

Expected: FAIL because module does not exist.

- [ ] **Step 3: Implement the adapter**

Use Node `crypto.createHmac('md5', secret)` only inside this provider adapter. Normalize money to integer minor units by parsing a decimal string, never floating multiplication of untrusted input.

Historical mapping order:

1. exact modern reference mapping;
2. exact legacy rule match from `WAYFORPAY_LEGACY_RULES_JSON` parsed into `{productId,amountMinor,currency,referencePattern?}`;
3. if zero or multiple rules match, return `productId:null` and classification `review`.

Provider requests always POST JSON to `https://api.wayforpay.com/api` with a 10-second abort timeout. Do not log provider payloads.

- [ ] **Step 4: Run tests**

```bash
node --test tests/wayforpay.test.cjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/wayforpay.cjs tests/wayforpay.test.cjs
git commit -m "feat: add WayForPay provider adapter"
```

---

### Task 4: Add the Privileged Payment Worker and Bridge API

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
- `serviceClient(config)` uses `SUPABASE_SERVICE_ROLE_KEY` server-side only.
- `registerTrustedOrder(input) -> {order}` calls `tv_register_order`.
- `verifyAndApplyReference(reference) -> {status,activeChanges}` calls WayForPay `CHECK_STATUS`, validates reference/amount/currency/signature, then `tv_apply_payment_status`.
- `/api/payments?action=register-order` accepts only bridge Bearer auth.
- `/api/payments?action=provider-event` accepts only bridge Bearer auth and a signed WayForPay callback payload; it never accepts buyer email as ownership proof.

- [ ] **Step 1: Write worker and boundary tests with fake Supabase/provider clients**

Test at minimum:

```js
test('bridge register rejects wrong secret', async()=>{
  const r=await runPaymentApi('register-order',{authorization:'Bearer wrong'},validPendingOrder());
  assert.equal(r.statusCode,403);
});

test('callback email cannot change registered order owner', async()=>{
  const worker=fakeWorker({registeredEmail:'buyer@example.test'});
  await worker.applyProviderEvent({...signedApproved,email:'attacker@example.test'});
  assert.equal(worker.registeredEmail,'buyer@example.test');
});

test('wrong amount from CHECK_STATUS grants nothing', async()=>{
  await assert.rejects(worker.verifyAndApplyReference('tv-base-1-x'),/payment_mismatch/);
  assert.equal(db.applied.length,0);
});
```

- [ ] **Step 2: Run tests and verify failure**

```bash
node --test tests/payments.test.cjs tests/payments-api.test.cjs
```

Expected: FAIL because worker/API modules do not exist.

- [ ] **Step 3: Implement service-role isolation and bridge boundary**

`server/service-supabase.cjs` must create a non-persisting server client from `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`; throw `service_db_not_configured` if either is absent. No service key fallback is allowed.

`server/payments-api.cjs` must:

- enforce `POST` + JSON for bridge mutations;
- compare `Authorization: Bearer <ATLAS_PAYMENT_BRIDGE_SECRET>` in constant time;
- cap request body at 128 KiB;
- return `Cache-Control: private, no-store`;
- expose no database/provider secret in errors;
- accept `register-order` fields: reference, verified checkout email, product key, amount minor, currency, purchase/order timestamp;
- accept `provider-event` callback fields only after the Atlas server independently validates the WayForPay merchant signature and then uses `CHECK_STATUS` before applying an access-changing state.

Update `.env.example`:

```text
SUPABASE_SERVICE_ROLE_KEY=
WAYFORPAY_MERCHANT_ACCOUNT=
WAYFORPAY_SECRET_KEY=
ATLAS_PAYMENT_BRIDGE_SECRET=
WAYFORPAY_LEGACY_RULES_JSON=[]
```

Update `vercel.json` so `api/payments.js` is deployed and no `_server/course.json` content is required by this payment function.

- [ ] **Step 4: Run worker, API, build, and existing tests**

```bash
npm run build
npm test
node --test tests/wayforpay.test.cjs tests/payments.test.cjs tests/payments-api.test.cjs
```

Expected: PASS and `grep -R "SUPABASE_SERVICE_ROLE_KEY" dist` returns no match.

- [ ] **Step 5: Commit**

```bash
git add server/service-supabase.cjs server/payments.cjs server/payments-api.cjs api/payments.js tests/payments.test.cjs tests/payments-api.test.cjs .env.example vercel.json
git commit -m "feat: add trusted Academy payment worker"
```

---

### Task 5: Bridge the Existing Live Landing Checkout Without Replacing Its Callback

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
- `ledgerCall(action,payload) -> {ok,mode}`.
- Rollout env: `ACADEMY_LEDGER_MODE=off|shadow|required`.
- `register-order` receives the validated checkout email before payment.
- `provider-event` receives provider callback status/reference but the Academy worker ignores callback email for ownership.

- [ ] **Step 1: Write checkout and callback bridge tests before production code**

Mock `global.fetch` and assert:

```js
check('create registers pending Academy order with server-validated email',
  bridge.body.action==='register-order' &&
  bridge.body.email==='buyer@example.com' &&
  bridge.body.productId==='mini-pro');

check('callback bridge payload does not use callback email as buyer identity',
  !Object.prototype.hasOwnProperty.call(bridge.body,'email'));
```

Test all rollout modes:

- `off`: no bridge fetch;
- `shadow`: bridge failure is logged/surfaced internally but checkout/callback behavior remains live-compatible;
- `required`: order registration failure prevents issuing a new checkout payload; callback persistence failure returns a retryable 5xx rather than signed accept.

- [ ] **Step 2: Run landing tests and verify failure**

```bash
npm test
node api/wayforpay-create.test.js
```

Expected: new tests FAIL because bridge module is absent.

- [ ] **Step 3: Implement `lib/academy-ledger.js` and wire both endpoints**

Use:

```text
ACADEMY_LEDGER_URL=https://<academy-host>/api/payments
ACADEMY_LEDGER_SECRET=<32+ random chars>
ACADEMY_LEDGER_MODE=shadow
```

`wayforpay-create.js` calls `register-order` after server validates email/phone, computes plan, amount, currency, reference, and orderDate, but before returning the signed widget payload.

`wayforpay-callback.js` keeps its existing WayForPay signature validation and serviceUrl. After validation it calls `provider-event`. In `required` mode, do not send WayForPay `accept` until Academy confirms durable processing. Keep SendPulse as a separate best-effort delivery concern; its failure must not mutate Academy payment truth.

Add the bridge vars to `.env.example`; never put the secret in frontend JS.

- [ ] **Step 4: Run landing tests**

```bash
npm test
node api/wayforpay-create.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit in the landing repository**

```bash
git add lib/academy-ledger.js api/wayforpay-create.js api/wayforpay-create.test.js api/wayforpay-callback.js api/wayforpay-callback.test.js .env.example package.json
git commit -m "feat: bridge WayForPay orders into TrueVoice Academy"
```

---

### Task 6: Add Admin History Preview/Commit, Registry, Transfer, and Manual Reconciliation

**Files:**
- Modify: `server/payments-api.cjs`
- Modify: `server/payments.cjs`
- Create: `tests/admin-payments.test.cjs`
- Create: `supabase/migrations/2026091003_admin_payment_operations.sql`

**Interfaces:**
- Admin auth is verified from the live Supabase user + `tv_account().user.role === 'admin'` before any service-role operation.
- `GET /api/payments?action=registry` returns up to 100 recent member/order/entitlement rows.
- `POST ...?action=history-preview` accepts `{dateBegin,dateEnd}` with maximum 31-day window.
- `POST ...?action=history-commit` accepts `{dateBegin,dateEnd,digest}` and re-fetches/re-normalizes the provider data before commit.
- `POST ...?action=reconcile-reference` accepts `{reference}`.
- `POST ...?action=transfer-entitlement` accepts `{orderId,resourceKey,targetUserId,reason}`.
- `POST ...?action=set-revoked` accepts `{orderId,resourceKey,revoked,reason}`.

- [ ] **Step 1: Write failing admin authorization and dry-run tests**

Tests must prove:

```js
assert.equal((await runAdmin('registry',{role:'student'})).statusCode,403);
assert.equal((await runAdmin('history-preview',{role:'admin',body:{dateBegin:1,dateEnd:1+32*86400}})).statusCode,400);
assert.equal(preview.items.find(x=>x.reference==='legacy-unknown').classification,'review');
assert.equal(preview.items.find(x=>x.reference==='tv-base-old').accessDays,210);
```

Also test preview digest mismatch blocks commit and re-running the same commit produces no duplicate entitlements.

- [ ] **Step 2: Run and verify failure**

```bash
node --test tests/admin-payments.test.cjs
```

Expected: FAIL because admin payment actions do not exist.

- [ ] **Step 3: Implement service-only admin SQL helpers**

Migration `2026091003_admin_payment_operations.sql` adds service-role-only public RPCs that return admin registry data, transfer/revoke entitlements, and write `tv_core.audit_events.detail`. The transfer RPC must require a destination UUID that exists in `auth.users` with confirmed email. It changes only `entitlements.user_id/claimed_at`; it never rewrites `orders.buyer_email`, preserving the financial ledger.

Manual revoke/restore must record actor UUID, order/resource, reason, old/new `revoked_at` state. Restore is refused when source order is `refunded` or `chargeback`.

- [ ] **Step 4: Implement history preview/commit**

`history-preview`:

1. signs/fetches `TRANSACTION_LIST` server-side;
2. normalizes email/reference/amount/currency/provider timestamps;
3. maps modern references first, then exact legacy rules;
4. classifies new/already-imported/expired/refunded/chargeback/review/conflict;
5. returns no card PAN/authCode/raw payload;
6. returns `digest = sha256(JSON.stringify(normalizedPreview))`.

`history-commit` re-fetches the exact window and recomputes the digest. If it differs, return `409 preview_changed`; otherwise verify each access-changing candidate with `CHECK_STATUS` and persist through the Task 1 RPCs. Unknown product rows may be registered as `product_id=NULL`, `status='review'`, with no entitlement.

- [ ] **Step 5: Run tests**

```bash
npm test
node --test tests/admin-payments.test.cjs tests/payments.test.cjs tests/wayforpay.test.cjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/2026091003_admin_payment_operations.sql server/payments-api.cjs server/payments.cjs tests/admin-payments.test.cjs
git commit -m "feat: add Academy payment administration"
```

---

### Task 7: Add Scheduled Reconciliation Without Revoking on Provider Failure

**Files:**
- Create: `server/reconcile.cjs`
- Create: `api/reconcile.js`
- Create: `tests/reconciliation.test.cjs`
- Modify: `vercel.json`
- Modify: `.env.example`

**Interfaces:**
- `runReconciliation({limit:50}) -> summary`.
- Vercel cron endpoint requires `Authorization: Bearer ${CRON_SECRET}`.
- Candidate order status is unchanged if WayForPay cannot be reached or response verification fails.

- [ ] **Step 1: Write failing reconciliation tests**

```js
test('provider outage preserves approved access',async()=>{
  const before=await db.order('o-approved');
  await runWithProviderFailure();
  const after=await db.order('o-approved');
  assert.equal(after.status,before.status);
});

test('verified refund revokes entitlement',async()=>{
  provider.reply(signedStatus({transactionStatus:'Approved',refundAmount:'15.00'}));
  await reconcile();
  assert.ok((await db.entitlement('o-approved')).revoked_at);
});
```

- [ ] **Step 2: Run and verify failure**

```bash
node --test tests/reconciliation.test.cjs
```

Expected: FAIL because reconciliation module does not exist.

- [ ] **Step 3: Implement worker and cron boundary**

For each candidate from `tv_reconcile_candidates(50)`:

- call `CHECK_STATUS`;
- verify merchant signature;
- require matching reference, amount, currency;
- apply status through `tv_apply_payment_status`;
- update `last_reconciled_at` only after a valid provider response;
- collect failures in the returned summary without changing the last verified financial/access state.

Configure a daily Vercel cron in `vercel.json` for `/api/reconcile` and add `CRON_SECRET` to `.env.example`. The endpoint must reject missing/wrong Bearer token.

- [ ] **Step 4: Run tests**

```bash
node --test tests/reconciliation.test.cjs
npm test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/reconcile.cjs api/reconcile.js tests/reconciliation.test.cjs vercel.json .env.example
git commit -m "feat: reconcile WayForPay access daily"
```

---

### Task 8: Add a Small Synthetic QA Registry and Safe Cleanup

**Files:**
- Create: `server/qa-registry.cjs`
- Create: `tests/qa-registry.test.cjs`
- Modify: `server/payments-api.cjs`
- Modify: `supabase/migrations/2026091003_admin_payment_operations.sql` only before that task is committed; if Task 6 is already committed, create `supabase/migrations/2026091004_qa_cleanup.sql` instead.

**Interfaces:**
- `POST /api/payments?action=qa-seed` admin only.
- `POST /api/payments?action=qa-cleanup` admin only.
- Seed uses deterministic `provider='test'` references and `@example.test` emails; no production Auth users are created.

- [ ] **Step 1: Write the exact scenario test**

Expected purchase scenarios:

```js
const expected=[
 'qa-active-mini-base',
 'qa-active-mini-pro',
 'qa-expired-mini-base',
 'qa-lifetime-atlas',
 'qa-refunded',
 'qa-chargeback',
 'qa-review'
];
```

Assert every seeded order has `provider='test'`, there are at most seven payment rows, the review row has no entitlement, lifetime has `valid_until=null`, expired Mini ends before `now()`, and cleanup deletes only `provider='test'` events/entitlements/orders while preserving a seeded `wayforpay` control row.

- [ ] **Step 2: Run and verify failure**

```bash
node --test tests/qa-registry.test.cjs
```

Expected: FAIL because QA module/actions are absent.

- [ ] **Step 3: Implement seed and cleanup**

Seed deterministic records through the same payment RPCs used in production wherever possible. The expired case uses purchase time older than 210 days; the refund and chargeback cases first issue then apply terminal negative status. `qa-cleanup` deletes in dependency order `payment_events → entitlements → orders` where provider is exactly `test`, then writes an audit event.

Do not create a login bypass or synthetic Supabase Auth users in cloud.

- [ ] **Step 4: Run tests**

```bash
node --test tests/qa-registry.test.cjs
npm test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/qa-registry.cjs tests/qa-registry.test.cjs server/payments-api.cjs supabase/migrations
git commit -m "feat: add removable Academy QA registry"
```

---

### Task 9: Implement Locked Student Cabinet and Separate Admin Cabinet

**Files:**
- Create: `js/academy-admin.js`
- Modify: `js/academy.js`
- Modify: `academy-shell.html`
- Modify: `css/academy.css`
- Modify: `css/academy-interaction.css`
- Modify: `scripts/build.mjs`
- Modify: `tests/local-server.cjs`
- Modify: `tests/members-browser.cjs`

**Interfaces:**
- `session` returns account even when `account.access.atlas === false`.
- Atlas modules/content load only when `account.access.atlas === true` or admin authorization explicitly permits Atlas.
- `window.createAcademyAdmin({root,request,onOpenInternal,onClose})` renders admin tools only after role verification.

- [ ] **Step 1: Add browser tests for locked, active, and admin states**

Extend local fixtures with:

- `A`: active Mini buyer;
- `B`: second active buyer;
- `C`: explicit admin without commercial purchase;
- `D`: verified member with no purchase;
- `E`: expired Mini buyer.

Add browser assertions:

```js
assert.equal(await locked.locator('#account-panel').isVisible(),true);
assert.equal(await locked.locator('[data-access-state="locked"]').isVisible(),true);
assert.equal((await locked.request.get('/api/academy?action=content')).status(),403);
assert.equal(await locked.locator('#open-atlas').isDisabled(),true);

assert.equal(await admin.evaluate(()=>document.documentElement.dataset.memberState),'dashboard');
assert.equal(await admin.locator('#open-admin').isVisible(),true);
assert.equal(await student.locator('#open-admin').count(),0);
```

Keep all existing tests for 28 lessons, image protection, note conflict, microphone cleanup, and widths.

- [ ] **Step 2: Run browser test and confirm failure**

```bash
npm run build
node tests/members-browser.cjs
```

Expected: FAIL because current `enter()` immediately fetches gated course content and locks a no-entitlement account.

- [ ] **Step 3: Refactor Academy boot flow without regressing Atlas**

In `js/academy.js`:

1. call `session` first;
2. render cabinet from account metadata;
3. if `account.access.atlas` is false, do not request `content`, do not load Atlas modules, and keep account usable;
4. if true, lazily boot protected course/modules when member selects Atlas/Continue;
5. keep admin landing in student/dashboard state;
6. expose an `Admin` nav entry only for `role==='admin'`;
7. remove ordinary `Internal` controls from student navigation; admin module gets an explicit “Open internal methodology” action that fetches `admin-content` server-side before switching the Atlas to internal mode;
8. expired/refunded product cards show status and access end date; support copy uses `hello@truevoice.academy` and current official phone/contact links;
9. profile name remains editable when locked; verified email remains read-only.

`js/academy-admin.js` renders:

- registry/orders/access table;
- date-window WayForPay preview form;
- preview classifications + digest;
- explicit commit confirmation;
- single-reference reconcile;
- QA seed/cleanup;
- transfer entitlement + reason;
- revoke/restore + reason;
- internal methodology launch.

No service secrets or raw card fields appear in HTML/JS.

- [ ] **Step 4: Style the cabinet using the approved TrueVoice visual direction**

Keep black/deep-wine surfaces, crimson organic glow, restrained gold, existing logo, and calm reading surfaces. Add locked/admin/review/test badges. Ensure decorative motion is nonessential and disabled by `prefers-reduced-motion`.

- [ ] **Step 5: Run browser/mechanics/build tests**

```bash
npm run build
npm test
node tests/members-browser.cjs
node tests/mechanics-browser.cjs
```

Expected: all PASS at 320/390/768/1440 widths with no uncaught JS errors.

- [ ] **Step 6: Commit**

```bash
git add js/academy.js js/academy-admin.js academy-shell.html css/academy.css css/academy-interaction.css scripts/build.mjs tests/local-server.cjs tests/members-browser.cjs
git commit -m "feat: add locked student and admin cabinets"
```

---

### Task 10: Full Cross-Repository Payment and Access Regression Suite

**Files:**
- Modify: Atlas `package.json`
- Modify: Atlas `README.md`
- Create: Atlas `docs/qa/2026-09-10-academy-payments.md`
- Modify: landing `package.json`

**Interfaces:**
- One command in each repository runs all automated tests relevant to the repository.

- [ ] **Step 1: Add explicit scripts**

Atlas `package.json`:

```json
{
  "scripts": {
    "build": "node scripts/build.mjs",
    "test": "node --test tests/*.test.cjs",
    "test:browser": "node tests/members-browser.cjs",
    "test:mechanics": "node tests/mechanics-browser.cjs",
    "test:all": "npm run build && npm test && npm run test:browser && npm run test:mechanics"
  }
}
```

Landing `package.json` test script must run both callback and create tests.

- [ ] **Step 2: Run the exact regression matrix**

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

Required automated assertions include:

- active/expired/lifetime/revoked access;
- upgrade-only no grant;
- product disable does not revoke historical entitlement;
- policy change does not extend historical entitlement;
- account shell without purchase;
- A/B RLS isolation;
- explicit admin only;
- invalid/duplicate callback;
- approved→refund/chargeback;
- replayed approval after terminal negative;
- wrong amount/currency;
- history import twice;
- provider outage preserves state;
- synthetic cleanup isolation;
- all 28 lessons and protected artwork;
- two-tab note conflict;
- local recording teardown/account scope;
- 320/390/768/1440 and reduced motion.

- [ ] **Step 3: Record test evidence**

Write `docs/qa/2026-09-10-academy-payments.md` with commands, exact PASS counts, tested commit SHAs, synthetic-only caveats, and unresolved production gates. Do not state that OTP, real WayForPay purchase, Safari/iPhone, or refund are verified unless they actually were.

- [ ] **Step 4: Commit QA/docs**

```bash
git add package.json README.md docs/qa/2026-09-10-academy-payments.md
git commit -m "test: document Academy payment verification"
```

Commit landing test-script changes separately in `truevoice-landing`.

---

### Task 11: Cloud Migration, Shadow Rollout, and Production Gates

**Files:**
- No new source file is required unless verification finds a defect; use the committed migrations/config docs from previous tasks.

**Interfaces:**
- Cloud Supabase schema must match the additive migration sources.
- Landing rollout progresses `off → shadow → required` only after evidence at each gate.

- [ ] **Step 1: Verify migration history before changing cloud**

Read Supabase migration history for `aqskidnelqmowzfkjieg`. Confirm existing `academy_core_v1` and `academy_context_and_resume_v1` are present. Apply only the new additive migration SQL through controlled Supabase migrations, then read back columns, RPC grants, RLS flags, and product-resource policy.

Expected policy readback:

```text
mini-base  atlas duration 210
mini-pro   atlas duration 210
atlas-28d  atlas lifetime NULL
mini-upgrade: no atlas mapping row
```

- [ ] **Step 2: Seed synthetic payment rows only after admin UI is ready**

Call admin `qa-seed`, verify at most seven `provider=test` purchase rows and zero synthetic Auth users. Exercise admin registry/locked states, then run `qa-cleanup` and prove zero `provider=test` rows remain before historical import.

- [ ] **Step 3: Deploy Atlas preview with payment worker configured**

Configure preview-only server env:

```text
SUPABASE_URL=https://aqskidnelqmowzfkjieg.supabase.co
SUPABASE_PUBLISHABLE_KEY=<project publishable key>
SUPABASE_SERVICE_ROLE_KEY=<server-only secret>
WAYFORPAY_MERCHANT_ACCOUNT=<merchant account>
WAYFORPAY_SECRET_KEY=<server-only secret>
ATLAS_PAYMENT_BRIDGE_SECRET=<same random bridge secret used by landing preview>
CRON_SECRET=<random cron secret>
ATLAS_EMAIL_ENABLED=false
```

Verify anonymous `content`/`art` are still 401, locked accounts cannot fetch Atlas, admin is explicit, and no secret appears in downloaded JS/HTML.

- [ ] **Step 4: Roll landing integration in shadow mode**

Set landing preview/staging:

```text
ACADEMY_LEDGER_MODE=shadow
ACADEMY_LEDGER_URL=<Atlas preview /api/payments>
ACADEMY_LEDGER_SECRET=<matching bridge secret>
```

Run signed synthetic callback/checkout tests against preview endpoints. Confirm bridge failures do not break the current checkout in shadow mode and successful events create only expected test/staging rows.

- [ ] **Step 5: Historical import dry-run only**

As admin, preview small WayForPay date windows first. Review every `review`, amount/currency conflict, and product mapping. Do not press commit for historical data until the dry-run classifications and 210-day/lifetime outcomes are explicitly reviewed by the owner.

- [ ] **Step 6: Configure real member login gate**

Before `ATLAS_EMAIL_ENABLED=true`, configure and test:

- custom SMTP;
- Supabase OTP template with visible code token;
- CAPTCHA secret/site key;
- Auth/email rate limits;
- successful OTP delivery to `ceo@truevoice.academy`;
- explicit admin role still present after login.

- [ ] **Step 7: Controlled real payment smoke — human approval required before spend**

Use one owner-approved real purchase only after checkout, bridge, callback, and login are deployed to the intended environment:

```text
checkout → pending order → WayForPay Approved → durable payment event →
210-day or lifetime entitlement → verified email login → Atlas access
```

Do not initiate a real financial transaction without explicit approval of that purchase amount at execution time.

- [ ] **Step 8: Validate safe refund/reconciliation procedure**

Use a WayForPay-supported refund procedure only after the owner confirms the real test order may be refunded. Verify terminal negative state revokes the entitlement, account remains usable, and an old Approved replay cannot restore access.

- [ ] **Step 9: Complete non-code launch gates**

Before production promotion, record evidence for:

- physical iPhone/Safari;
- Firefox;
- keyboard/screen-reader smoke;
- privacy disclosure for account/progress/purchase metadata;
- repository/public-history and old deployment exposure decision;
- backup/restore and incident notes;
- historical import review;
- daily reconciliation functioning.

- [ ] **Step 10: Switch landing ledger mode to required and promote only after all gates pass**

Set `ACADEMY_LEDGER_MODE=required` only after the Academy endpoint is proven durable. A failed order registration must then stop creation of a new checkout, and a failed provider-event persistence must remain retryable rather than silently acknowledge access-critical state.

Commit no production secrets to Git. Record final deployment SHA/URLs and smoke results in the QA document.

---

## Plan Self-Review Result

- **Spec coverage:** identity, student-first cabinet, locked account, admin/internal boundary, 210-day/lifetime policies, immutable entitlements, new payments, historical import, reconciliation, refund/chargeback, QA registry, progress/voice behavior, security, audit, privacy, and launch gates all map to explicit tasks above.
- **No duplicate buyer registry:** admin registry is derived from the existing order/entitlement/profile/Auth model.
- **Payment ownership:** new checkout email is registered from the trusted server-side order-create path; callback email is not trusted for ownership.
- **Historical safety:** import is preview/digest/re-fetch/verify/commit, and unknown mapping yields `review` without access.
- **Cross-repository rollout:** existing landing callback remains authoritative during migration; Academy ledger starts in shadow and moves to required only after evidence.
- **Type/interface consistency:** payment state changes flow through `tv_register_order` + `tv_apply_payment_status`; callback/import/reconciliation do not implement separate state machines.
