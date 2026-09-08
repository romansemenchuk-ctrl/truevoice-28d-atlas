# TrueVoice Academy Core — implementation plan and scope

Approved by Roman in the current project conversation: return to the supplied Supabase project, use a shared Academy database, continue implementation without changing live checkout/main. Base: Atlas 3.0 commit ea4bb05fb5e54157339205c10f6bc5744ea8fcde.

## Architecture

Browser → Vercel API → Supabase Auth + narrow PostgreSQL RPCs. SSR Auth cookies are HttpOnly; the browser never receives privileged keys. Purchase eligibility and admin roles live in the database, not client storage. The old 28-lesson course/controller is retained; build-time compatibility transforms are explicitly checked and protected content is removed from the public distribution.

## Tasks

1. [x] Database core: shared catalog/orders/entitlements, own profile/lesson state, session and role checks, explicit function grants, RLS on all tables. Test guest, A/B, refund/expiry, deleted session and invalid step writes with actual SQL under restricted roles.
2. [x] Server boundary: fresh Auth user validation, small authorization RPC, separate internal-content route, exact-origin/CSRF protection, bounded JSON bodies, no-store private responses. Real mail delivery remains gated off.
3. [x] Member UI: branded entry screen, student dashboard, products/progress/notes/bookmarks, profile/resume, per-account local recordings, optimistic conflict handling and draft export. Preserve legacy lessons and existing anatomy artwork.
4. [x] Regression investigation: fix account navigation order, prevent the new status bar covering anatomy buttons, stop scroll races on lesson navigation. Test all 28 lessons and four images, modal/microphone cleanup and responsive widths.
5. [ ] Publish verified feature branch and draft PR; inspect the actual Vercel preview. Do not merge production.

## Verification gates

Run `npm ci`, `npm run build`, `npm test`, `npm run test:browser` with Playwright available. Unit/API/SQL/build tests and browser tests use synthetic identities; no real emails. A separate SQL assertion run in the approved Supabase project creates and rolls back synthetic fixtures. Confirm zero remaining users/orders/entitlements/admins afterward.

Code review boundaries: no secrets in source; the project key is deliberately publishable, not service-role. No fixture imported into api/ or emitted to dist. Auth identity alone does not imply purchase. Role/purchase mutations have no browser endpoint. Imported legacy state cannot set admin roles. Exact source lessons must remain unchanged.

## Deferred launch gates

SMTP and OTP template, provider CAPTCHA/rate limits, verified owner identity and admin assignment, trusted historical purchase import, exact durations, WayForPay idempotent ingestion/refund/outbox worker, private content repository decision, physical iPhone/Safari/Firefox and assistive-technology QA. No claims of a finished production account or completed scientific illustration overhaul are permitted until those gates pass.

The Supabase project initialized here is the approved new cloud project, not an automatically purchased Supabase branch. Only synthetic local fixtures and rolled-back cloud tests were used. Neon and the active landing/payment system are unchanged.
