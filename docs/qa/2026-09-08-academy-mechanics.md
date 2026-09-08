# Academy Core: synchronized mechanics verification

Extends the existing protected Academy implementation at commit `7725d27aae8b2904603902c3b890f493e7c27587` (PR #2). No database replacement, customer import, live payment changes or production merge.

## Changed behavior

The monotonic breath guide publishes its current phase to the anatomy workspace. The diaphragm dome, lung expansion, airflow direction and displayed phase now derive from this single sample. Holds hide airflow. Pause and reset update the exact frozen state. Changing anatomical plates does not reset the ongoing guide. Reduced-motion retains the textual instruction with a stationary drawing. The independent slow phonation demonstration pauses in a hidden document.

The four existing artistic anatomy images are retained. SVGs remain simplified educational diagrams; this work is not clinical validation of the images or the original lesson claims.

## Test-first evidence

The new mechanics suite was run against the previous build before implementation: 1 passed, 8 failed. The missing phase elements and background phonation pause were reproduced. After changes, the same nine scenarios passed.

Fresh verification on Node 22.22.1:

- `npm run build`: successful; lesson payload and artwork remain outside the public static distribution.
- `npm test`: 29 passing, 0 failures (API, build and PostgreSQL/PGlite policy/entitlement tests).
- `node tests/members-browser.cjs`: 14/14 PASS in Chromium.
- `node tests/mechanics-browser.cjs`: 9/9 PASS in Chromium.
- `git diff --check`: clean.

Browser authentication and the microphone are synthetic localhost fixtures. These tests do not establish real email delivery, native device microphone behavior or a physical Safari/iPhone result. Live email login remains disabled pending SMTP/CAPTCHA setup. Real purchases and a verified administrator are not seeded.

Cloud inventory read directly from the approved Supabase project: 11 application tables, 0 tables without RLS, 0 Auth users, 0 orders, 0 entitlements, 0 administrators. Existing `tv_core` schema is reused. A duplicate-schema attempt was rejected and rolled back; the catalog confirms no `tv_private` schema remained. Do not re-run the original CREATE migrations on an initialized project.

## Review artifacts

Actual cabinet screenshot from a synthetic QA account:
https://d2ol7oe51mr4n9.cloudfront.net/user_2wfLw0ZIROPkyh8m20FzqBXAQ46/27bc4715-5aa7-4670-83ab-ec46527b7ef3.png

Review ZIP with cabinet/login/mobile/mechanics screenshots and test logs (no credentials, fonts or customer records):
https://d2ol7oe51mr4n9.cloudfront.net/user_2wfLw0ZIROPkyh8m20FzqBXAQ46/4d40a05e-22c1-445b-8038-5f04ee954931.zip

Before customer launch: configure/test email delivery and CAPTCHA, explicitly assign the confirmed author account, approve the product-duration matrix and verified purchase import, implement idempotent payment ingestion/refund delivery, review public repository history and prior public deployments. New route protection does not recall copies already published.
