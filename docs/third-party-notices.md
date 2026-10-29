# Upstream components and licenses

Versions are pinned in `package.json` and the committed npm lockfile. Installed packages retain their upstream license files; consult those files for the full terms, including transitive dependencies. No separate project-wide open-source license is selected by this notice.

| Component                                          | License                                    | Source                                                                                                           |
| -------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Next.js, React, React DOM                          | MIT                                        | [Next.js](https://github.com/vercel/next.js), [React](https://github.com/facebook/react)                         |
| TypeScript                                         | Apache-2.0                                 | [Microsoft](https://github.com/microsoft/TypeScript)                                                             |
| Tailwind CSS                                       | MIT                                        | [Tailwind Labs](https://github.com/tailwindlabs/tailwindcss)                                                     |
| shadcn/ui source components                        | MIT                                        | [shadcn/ui](https://github.com/shadcn-ui/ui)                                                                     |
| Radix UI                                           | MIT                                        | [Radix](https://github.com/radix-ui/primitives)                                                                  |
| Supabase JavaScript / CLI                          | MIT                                        | [Supabase JS](https://github.com/supabase/supabase-js), [CLI](https://github.com/supabase/cli)                   |
| Zod                                                | MIT                                        | [Zod](https://github.com/colinhacks/zod)                                                                         |
| Lucide icons                                       | ISC                                        | [Lucide](https://github.com/lucide-icons/lucide)                                                                 |
| Geist font                                         | SIL Open Font License 1.1                  | [Geist](https://github.com/vercel/geist-font), distributed by Fontsource                                         |
| qrcode                                             | MIT                                        | [node-qrcode](https://github.com/soldair/node-qrcode)                                                            |
| class-variance-authority, cn (plus transitive clsx) | Apache-2.0 / MIT (see individual packages) | Installed package license files                                                                                  |
| Vitest                                             | MIT                                        | [Vitest](https://github.com/vitest-dev/vitest)                                                                   |
| Playwright, axe-core/playwright                    | Apache-2.0 / MPL-2.0                       | [Playwright](https://github.com/microsoft/playwright), [axe-core npm](https://github.com/dequelabs/axe-core-npm) |
| Wrangler, Cloudflare Workers types                 | MIT / Apache-2.0 (see individual packages) | [Workers SDK](https://github.com/cloudflare/workers-sdk)                                                         |

The three concept images were generated for this project with Image Gen. They guide the interface; the functioning dashboard, charts, preview, icons and QR labels are rendered from code and actual API data. No third-party photography, stock illustration or customer brand asset is used.

The walkthrough is recorded with Playwright's bundled FFmpeg runtime. That runtime is a development tool and is not shipped in the application. The npm installation audit reported zero known vulnerabilities when this release's lockfile was installed; that is a point-in-time check, not a future guarantee.
