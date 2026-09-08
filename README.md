# TrueVoice Academy / Atlas — Core 4.0 preview

This branch adds a shared Supabase Academy backend and a member account to Atlas 3.0. It is a preview, not a production migration of existing students or live checkout.

## Implemented

- Shared `tv_core` schema: products, resources, product eligibility, orders, entitlements, roles, profiles, lesson catalog/state, payment-event and audit foundations. All 11 tables enable RLS. No customer or admin grants are seeded.
- Supabase Auth through `@supabase/ssr` on the server. Auth cookies are HttpOnly, Secure and host-only in deployed environments. No service-role key is used. Each private request verifies the Auth user and checks current session/grants in PostgreSQL. Application sessions have a 12-hour maximum enforced in the database.
- Student view by default, including for admins. Internal lesson methodology is fetched separately with a server-verified admin role. An Auth account without a paid entitlement does not unlock the application.
- Account dashboard, own products, 28-day progress map, bookmarks, profile and per-lesson notes. Optimistic revisions expose conflicts instead of silently overwriting. Unsynced drafts are scoped to the user in sessionStorage. Legacy v3 progress is imported explicitly, not silently claimed by the first login.
- Original 28 lesson text is unchanged. The build puts course JSON and four existing artwork plates in `_server/`, not `dist/`. Protected APIs serve these assets. The v3 controller is retained with explicit, checked build-time compatibility transforms.
- Voice recordings use a per-account local IndexedDB database; they are not uploaded or included in JSON progress exports. Account navigation pauses practice clocks, the breath guide and microphone activity.
- UI uses the existing TrueVoice Sun/Moon/axis mark, original landing contacts and black/crimson styling. The account status bar stays in document flow instead of intercepting anatomy controls.

## Run and test

Node 22 is required. Run `npm ci`, `npm run build`, then `npm test`. Browser tests require Playwright/Chromium available to Node (`npm install --no-save playwright` in a disposable QA workspace, then `npx playwright install chromium`), followed by `npm run test:browser`. The browser suite starts its own localhost server on 8081 and uses actual PostgreSQL SQL/RLS through PGlite with synthetic identities. It never sends real emails, touches customer data, or connects the local fixture to Supabase.

Do not serve the repository root publicly: it contains source lessons and `_server`. Serve only `dist` alongside the authorized Vercel API. A generic static server cannot implement the member API. `tests/local-server.cjs` is a localhost-only QA fixture, NOT an alternate login mechanism; it is neither loaded by `api/` nor copied into the distribution.

The build downloads a SHA-256-pinned artwork pack from the owner's media library. Set `ARTWORK_PACK` to a verified archived copy for offline builds. Artwork delivery itself is same-origin through the authorized API. Google Fonts still require connectivity.

## Configuration and safety gate

`server/project.cjs` contains only the project's non-privileged publishable key. This is designed to be public; it does not grant database or course access. Override with `SUPABASE_PUBLISHABLE_KEY` when rotating. Never replace it with a service-role or secret key. `ATLAS_SITE_URL` must be the exact production origin; Vercel-generated deployment/branch origins are added automatically.

`ATLAS_EMAIL_ENABLED` defaults to false. Until custom SMTP, the Supabase email template containing `{{ .Token }}`, suitable Auth rate limits and Supabase CAPTCHA are configured and tested, the public page accurately says sign-in is not open. `TURNSTILE_SITE_KEY` is the public CAPTCHA site key; its secret belongs in Supabase Auth configuration. Do not enable the gate merely to make the button clickable.

The health endpoint reports configuration, email gate and server-bundle presence, not a completed customer-login test. Supabase may allow creation of an Auth identity; Academy access is independently purchase-gated. The publishable Auth endpoint is not a privilege boundary by itself.

## Database operations

SQL sources in `supabase/migrations` correspond to the applied management migrations `academy_core_v1` and `academy_context_and_resume_v1` in the explicitly approved project. They rebuild a fresh local database. Do NOT blindly run these CREATE statements again on the initialized project or run CLI push without reconciling the management-generated migration versions. Read existing migration history first. The isolated live verification used synthetic rows inside a rolled-back subtransaction and left no test customers.

Keep `tv_core` out of exposed Data API schemas. Only the narrow public RPCs are callable by authenticated users; their logic derives user ID from Auth, not request payload. Runtime has no purchase/admin-write endpoint. Future verified payment ingestion needs a separate, least-privilege server worker. Audit/payment tables are a foundation, not a completed worker or automation.

## Still required before launch

1. Configure and test actual SMTP/OTP/CAPTCHA delivery. No real OTP email has been sent by this work.
2. Confirm the owner's Auth identity, then assign admin explicitly. No first-user-is-admin rule exists.
3. Agree exact product/access durations, import trusted historical orders with a dry run and payment reconciliation, and implement idempotent WayForPay ingestion/outbox with refund/chargeback handling. The existing landing/checkout/SendPulse flow is untouched.
4. Review deployment and actual iPhone/Safari/Firefox behavior, assistive technology, load/concurrency and operational backups. Chromium with a synthetic microphone is not physical-device certification.
5. Decide how to handle the existing PUBLIC repository/history and old public deployments. New API gating cannot recall previously published copies. Do not add new confidential content here before making that decision.

Anatomy artwork remains an artistic interpretation and the diagrams are simplified; this stage is not a new clinical illustration pack or full scientific audit. The larger requested animation/illustration refinement remains a subsequent stage. The user's business card was not present in the attachments and has not been incorporated.

## References

- https://supabase.com/docs/guides/auth/server-side/creating-a-client
- https://supabase.com/docs/guides/auth/auth-email-passwordless
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/auth/auth-smtp
