# VanLog release verification

Project: P07 VanLog. Environment: Windows 11, Node 24.14.0, production static export served by Cloudflare Pages Functions, and the actual hosted Supabase project `gvtazbiscsopygddtclb` (PostgreSQL 17, Paris region). Only synthetic data is used.

## Recorded checks

| Requirement                      | Evidence                                                                                                                                 | Result                                                                                                             |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Foundation                       | `npm run check`; production `npm run build`; health/config endpoints                                                                     | TypeScript and ESLint pass; 14 unit tests pass; ten static routes exported                                         |
| P07-A1 Equipment / QR / archives | Browser workflow downloads an SVG, opens the exact equipment QR route while signed out, returns after sign-in; hosted API archive checks | Route, identity, label generation and archive rejection checked; physical phone-camera scanning remains unverified |
| P07-A2 Role enforcement          | Hosted tests issue crafted staff schedule, archive, history and cost requests; anonymous/authenticated direct RPC calls                  | Owner-only requests denied; staff equipment history omits cost fields; database RPC is service-only                |
| P07-A3 Concurrent readings       | Two actual requests with one version; reading-vs-service race                                                                            | Exactly one success and one conflict; no extra history                                                             |
| P07-A4 Due rules                 | Hosted 145/150/150.1-hour cases, calendar and combined rules; local PostgreSQL leap-day cases                                            | Exact threshold and most-urgent status checks pass                                                                 |
| P07-A5 Service replay            | Duplicate identical requests, changed payload, stale meter version, expired receipt                                                      | One service/cost; mismatched replay rejected; stale attempts append nothing                                        |
| P07-A6 Failure recovery          | Browser commits a reading with `route.fetch()`, then drops its response and retries                                                      | Values retained; frozen original request ID reused; committed result resolved                                      |
| P07-A7 Recovery                  | Actual hosted export restored into isolated PostgreSQL 17                                                                                | Eight equipment, nine tasks, six readings, two services; total 12,150 minor units; IDs and totals match            |
| Integrity / capacity             | Restore self-checks and strict API validation                                                                                            | 100 equipment, 20 tasks, 10,000 logs; invalid/future baselines, runtime, money and malformed backups rejected      |
| Identity                         | Hosted login/logout, disabled profile and rejected session creation; local expiry checks                                                 | Eight-hour absolute sessions, revocation and account disabling enforced                                            |
| Browser quality                  | Playwright at 1440×1000 and 360×800; axe WCAG A/AA checks; keyboard focus and dialog Escape                                              | See browser evidence below                                                                                         |
| Cost exports                     | Owner browser workflow, CSV content assertion, print media layout                                                                        | Exact $12.34 fixture cost, CSV download and print view checked                                                     |

The compact JSON evidence files record actual outcomes and execution times. Raw test output, private fixture manifests and any failure screenshots remain ignored in `test-results/` and `.secrets/`.

- [Unit / hosted results](verification-tests.json)
- [Browser results](verification-browser.json)
- [Restore results](verification-restore.json)
- [Deployed performance](verification-performance.json)
- [Deployment smoke checks](verification-deployment.json)

## Provider advisors and explicit limits

Supabase's security advisor reports nine informational “RLS enabled, no policy” notices. These tables intentionally deny all anonymous/authenticated access in a private schema; only the trusted service-role backend calls them. Adding permissive policies to silence those notices would weaken this architecture. [Advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

The advisor also warns that leaked-password protection is disabled on this Free project. Provisioning generates independent 256-bit passwords and no self-registration/password-choice flow is exposed by VanLog. No paid upgrade was enabled. [Password-security guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Two informational foreign-key index notices concern historical actor IDs. Accounts are retained, not deleted; the documented reads use equipment/time/task/report indexes. Extra indexes were not added for an unused actor-deletion or actor-filter path. [Index guidance](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys).

The public demo and branch previews share mutable fictional records. Automated tests use only manifested `QA-` fixtures and never call a whole-demo reset. The application backup omits Supabase Auth credentials and is not a full provider backup. Real devices, label printers, real kitchen operations, long-duration soak tests and external uptime monitoring were not exercised. Windows WebKit's default keyboard order skips links; its primary button and dialogs are checked with the available keyboard order.

The p95 target is under 1.5 seconds with ten concurrent demo sessions. The benchmark records complete response times from the operator's Dhaka network for a specified authenticated read workload. It excludes password verification and is not an uptime or worldwide latency promise; consult the JSON result for the measured value and sample count.
