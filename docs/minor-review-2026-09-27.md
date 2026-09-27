# Minor fixes and review — 2026-09-27

Scope: targeted reliability/security fixes and SEO metadata. No page layout,
styling, pricing, subscription policy, or production schema changes.

## Fixed

- Payments: reject malformed signed webhook objects before database access;
  require the configured store, variant and an explicit boolean test-mode flag.
  Validate nested checkout responses and URLs before returning them to clients.
- Payments: replace the reserved structured-logging `event` keyword. Previously,
  ignored webhooks and provider lookup failures could crash in the logging call.
- Sessions: network failures, rate limiting and server errors during refresh no
  longer erase browser credentials. Rejected/blocked sessions still clear.
  Late refresh responses cannot recreate a logged-out session.
- Checkout return: stop processing a completed refresh after leaving the page.
- Notes: Replace All edits document text, preserving formatting and image/link
  attributes and treating replacement text as text rather than HTML.
- SEO: canonical, sitemap and social URLs now use the actual Vercel origin,
  `https://flow-desk-beryl.vercel.app`. Added authentication/legal page titles and
  excluded the authentication callback from the crawl list.
- Dependencies: updated the affected Tiptap family, Axios, React Router,
  DOMPurify and affected build dependencies within their existing major versions.
  The npm dependency audit reports zero known vulnerabilities after resolution.
- CI: added frontend regression tests using the existing TypeScript dependency
  and Node test runner, including real Axios interceptors and ProseMirror documents.

## Verification

- Backend: 124 passed; two compiler tests skipped because local GCC/G++ are absent.
- Frontend: 14 regression tests passed; lint and production build passed.
- Python dependency consistency and Alembic migration history checks passed.
- Deployed API health reports healthy/database connected; frontend returns 200.
- Deployed Google start redirects to Google; invalid payment signatures return 401.
- Payment regression cases include verified Free-to-Pro updates, cancellation,
  expiration, resumption, duplicate delivery, invalid payloads and lookup outages.
- No real payment was charged and no live customer subscription was modified.

Browser automation is unavailable in this session. Hosted payment completion,
interactive Google sign-in and a visual inspection of every page are not claimed
verified. The Notes bundle is slightly over Vite's 500 kB warning threshold and
remains lazy-loaded; the build succeeds. Python dependencies emit deprecation warnings.

## Larger findings left outside this minor-fix scope

The read-only live database audit reports migration `20260621_0006`, while the
GitHub migration head is `20260926_0007`. RLS is enabled, but browser roles retain
table privileges and existing policies. That requires a deliberate review of
effective access; RLS being enabled alone does not establish the intended grants.

The live schema also differs from the model definitions. Confirmed missing
columns include `collections.parent_id`, `collections.description`,
`collections.deleted_at`, `note_versions.content_text`, `note_versions.word_count`,
`tags.updated_at`, `users.email_verified_at` and `users.preferences`.
Several model index names are absent; equivalent existing indexes must be checked
before creating replacements. Some reported type differences are representation
differences rather than necessarily incompatible types.

Migration `0007` tries to index `collections.parent_id`. Because that column is
absent, a blanket production upgrade should first reconcile the live schema with
the migration assumptions. This review does not apply that migration. The backend
deployment uses only the two reviewed payment source files and preserves the
existing deployment/migration configuration.

Lemon Squeezy remains in test mode. Live activation still requires a live API key,
variant, webhook and signing secret, followed by a real purchase acceptance check.

## References

- [Lemon Squeezy subscription attributes](https://docs.lemonsqueezy.com/api/subscriptions/the-subscription-object)
- [Google canonical URL guidance](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
- [Tiptap security advisory](https://github.com/ueberdosis/tiptap/security/advisories/GHSA-cp6q-959q-f8rh)
- [Axios security advisory](https://github.com/axios/axios/security/advisories/GHSA-mmx7-hfxf-jppx)
- [React Router security advisory](https://github.com/remix-run/react-router/security/advisories/GHSA-wrjc-x8rr-h8h6)
- [DOMPurify security advisory](https://github.com/cure53/DOMPurify/security/advisories/GHSA-55q2-fjhq-7xh7)
