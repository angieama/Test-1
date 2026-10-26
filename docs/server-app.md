# Lipa Verify

A mobile-first merchant payment verification app with a private hosted workspace, a durable Cloudflare D1 database, instant amount and customer search, and a rolling 30-minute window.

## Features

- Exact amount filtering using integer cents, combined with name or receipt search.
- Automatic 15-second refresh and rolling payment expiry using synchronized server time.
- Permanent receipt-to-customer verification, one- or two-passenger claims, and saved verification history.
- Atomic database claims: simultaneous requests cannot confirm the same receipt twice.
- Server-side owner scoping and ChatGPT identity in production.
- Accessible confirmation dialogs, responsive mobile navigation, loading and connection states.
- Clearly labelled sample receipts, plus a form to add more sample payments.
- Installable mobile web app with Android icons, an iPhone home-screen icon, and a standalone window.
- In-app installation instructions and a native install prompt when the browser supports it.
- Touch-friendly controls, keyboard-friendly text sizes, and device safe-area support.
- Offline fallback screen; payments, claims, sign-in pages and private HTML are never cached by the service worker.

## Install on a phone

Open the deployed HTTPS app in the phone's browser and sign in. Open the workspace menu (•••) for installation instructions.

- Android/Chrome: menu → Add to Home screen or Install app → Install.
- iPhone/Safari: Share → Add to Home Screen → Add. Keep Open as Web App enabled if offered.

Open LipaVerify from the home screen. This is a progressive web app (PWA), distributed by its URL; it does not include an APK, IPA, Play Store listing, or App Store listing. A network connection is required to load and verify payments. The service worker stores only static icons and a generic offline screen, never payment records or verification requests. Private access and saved receipt locks are shared with the web app after sign-in.

## Development

Use Node.js 22.13 or newer and the project lockfile. Install with `pnpm install --frozen-lockfile`, then run `pnpm dev`. The standard Sites helper configures the managed preview environment.

The manifest declares the `DB` D1 binding. SQL migrations live in `drizzle/`. Generate changes with `pnpm db:generate`; apply migrations to the local D1 instance before testing. Production migrations are applied by Sites publication.

## Payment integrity

Each claim uses a single conditional SQL insert. The receipt primary key rejects duplicate claims, checks ownership and the 30-minute expiry server-side, and records the claimant and confirmation time. Database triggers also prevent updates or deletion of claims. There is no unlock or reset operation.

Sample initialization is an atomic transaction and runs once per account. Sample receipts age normally; new sample payments can be added after the initial window expires. Preview data is separate from the production workspace.

Values are handled as integer cents rather than floating-point amounts. Recent filtering uses `received_at > now - 30 minutes` and excludes future timestamps.

All recent payments are included without a row cap. Verified history includes the latest 500 confirmations plus any other confirmations still in the rolling window; older database records are retained.

## Validation

`node tests/mobile-app.test.mjs` checks install metadata, icon dimensions, authenticated manifest loading, the offline fallback, and static-only caching. Phone-width browser QA covers the installation guide and receipt confirmation flow. Actual Android/iOS installation needs to be completed on a phone.

`python tests/integrity.py` verifies the actual claim SQL, merchant isolation, expiry boundaries, simultaneous claims, and immutable receipts. `node --experimental-strip-types tests/amounts.test.mjs` checks exact cents and window filtering. Run `node node_modules/typescript/bin/tsc --noEmit` and `pnpm build` for the full type and production build checks.

The optional `tests/integration.py` exercises the HTTP APIs on a standalone local preview; it requires direct HTTP access to that preview.

## Live integration

This release is a functional demo and does not receive real M-Pesa payments, read SMS, or transfer money. It is not yet an approved M-Pesa Super App mini app. A live merchant integration needs an authenticated server-side payment ingestion path, upstream receipt authenticity and unique receipt validation, production merchant authorization, and the relevant provider approval. Never treat sample receipts or browser-supplied payment details as proof of a real payment.

The deployed workspace uses the platform’s private access boundary. Production APIs require the platform-provided ChatGPT user identity; local development has a separate preview owner only when the development build flag is enabled.

## Journeys and fare QR

Start a journey with an origin, destination and fare per passenger. New sample payments are assigned to the active journey. Existing receipts remain unassigned. Each journey retains its received total, receipt count and confirmed passenger count. Ending a journey allows the next ride to start. Recorded payment fares and journey associations cannot be changed.

Passenger counts are automatically calculated as whole fares covered by each receipt (amount divided by its recorded fare), including groups of ten or more. Remainders are displayed as extra money and do not count as another passenger. A fare is required before confirmation. Fare changes apply to new receipts and new QR requests; earlier receipt fares are preserved.

Fare QR codes are scannable text previews containing the route, fare, passenger count, total and request reference. They do not initiate M-Pesa payments. Payment-enabled QR generation requires an approved Safaricom Daraja merchant integration. The private workspace access policy is preserved.

### Split payments / top-ups

Open an unverified receipt and choose **Combine with another payment**. Select a second recent receipt from the same first name, journey and fare. Confirm both transaction codes with the customer before saving; first names alone are not an identity check. The combined total calculates covered passengers and any shortfall. Both original receipts are locked in one atomic database statement, using the existing immutable claims ledger. The shared claim reference links the receipts, and only the anchor claim contributes passenger counts, so journey totals do not count passengers twice. No schema change is needed. Both receipts must remain within the 30-minute verification window.

Run `python tests/combine-payments.py` to check atomic locking, overlapping concurrent attempts and ownership/window guards.

### Random ride simulation

Use **Generate sample passengers** on an active journey or its Payments view. Choose 4–30 paying customers. Every batch contains exact payments, unresolved underpayments, two-receipt top-ups and group payments for up to ten people (subject to the amount limit). Names and amounts are randomized; names are unique within each batch. All receipts remain unverified, use the current journey's fare snapshot, and are inserted in a D1 transaction guarded against ended rides or fare changes. Repeating adds another batch. No real funds are moved. Test with `node --experimental-strip-types tests/ride-simulator.test.mjs`.

### Earnings reports

The Earnings tab reports Today, This week (Monday onward), This month, All time, and inclusive custom date ranges in Africa/Nairobi time. Server-side SQL reads the full owner-scoped payment ledger, independent of the 30-minute verification window. Reports show received, verified and unverified money; underpayments are included at the actual amount received, and split receipts each contribute their own amount once. Totals include unassigned receipts, separately disclosed. Rides are ranked by money received within the selected range, even when a ride started earlier. Reports show the top 100 rides with totals across all rides. This is gross received money, not profit.

Validation: `node --experimental-strip-types tests/earnings.test.mjs` and `python tests/earnings.py`.

### Refund records

Use **Record refund** on any receipt for a full or partial refund. This is a demo ledger operation, not an M-Pesa transfer. Multiple partial refunds are supported up to the original amount. Immutable refund entries use request IDs for retry protection, with an atomic amount-cap check and database triggers that prevent over-refunding. Refunded unverified receipts cannot later be confirmed or combined; existing confirmations stay locked and passenger counts remain their original recorded values. For combined payments, refund each receipt separately. Earnings show gross money received, refunds by their recorded date, and net earnings; rides rank by net cash flow within the chosen dates, including refunds of older payments.

Checks: `python tests/refunds.py`, `python tests/earnings.py`.

### Code organization and checks

- `app/hooks/use-payment-ledger.ts` owns the payment feed, selected ride, server clock, connectivity and polling. It cancels superseded requests and cleans up requests/listeners on unmount. Receipt dialogs follow the latest ledger data.
- `lib/client-api.ts` centralizes uncached JSON requests, bounded timeouts, cancellation and readable HTTP/network errors. Mutations are never automatically retried; refund request IDs retain their existing retry protection.
- Journey and claim-reference indexes support historical ride lookups and combined-receipt summaries without full scans of those lookup columns.
- Run `npm run check` (or `pnpm check`) for TypeScript, client API, amounts, PWA, simulator, earnings, refund and concurrency checks. Python 3 and the project's Node version are required. Production build remains separate.

### Cash at ride completion

The End journey form accepts an optional cash total (zero by default, up to KSh 250,000 with exact cents). Cash and the completion timestamp are saved in one owner-scoped conditional update, so concurrent or repeated completion cannot duplicate cash. Completed cash is protected against edits by a database trigger. Ride totals show M-Pesa and cash separately. Cash contributes to received/net earnings and ride rankings on the ride completion date, while M-Pesa receipts and refunds retain their own dates. Aggregate cash does not generate fake customer receipts or confirmed passenger counts. Run `python tests/cash.py` or the full `npm run check`.
