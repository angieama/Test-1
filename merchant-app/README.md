# GitHub checkout quick start

This folder contains the database-backed Lipa Verify app with ride sales, cash recording and the performance update. The live demo is https://lipa-verify.glossygull16.chatgpt.site . The root repository webpage is a separate static demo.

Validated with Node 24.22.1. From this directory:

```sh
npm exec --yes pnpm@11.25.0 -- install --frozen-lockfile
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_shiny_rogue.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_stale_karen_page.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0002_graceful_molten_man.sql
npm run dev
```

Apply each local migration once, in order, to a new database. Clean clones default to portable development. This app requires its Worker server and D1 database; GitHub Pages serves only the separate static app in the repository root. The tracked hosting manifest identifies the existing hosted Site; it contains no credentials.

Regression checks:

```sh
node --experimental-strip-types --test tests/optimization-and-rides.test.mjs tests/mobile.test.mjs
python3 -m unittest discover -s tests -v
node node_modules/typescript/bin/tsc --noEmit
```

---

# Lipa Verify

A mobile-first merchant payment verification prototype built with React, TypeScript, Vinext and Cloudflare D1.

## Features

- Exact amount matching, stored as integer cents, including decimal amounts.
- A rolling 30-minute verification window based on server time.
- Instant case-insensitive customer, receipt and claim-reference search.
- Status filters and auto-refresh every 15 seconds.
- Durable tick-off confirmations with a customer, seat or order reference.
- Atomic conditional database updates reject duplicate and expired claims with HTTP 409, including concurrent requests from different devices.
- Saved confirmations remain available after their verification window expires.
- Demo payment simulator; data persists in the server database.
- Responsive layout, keyboard-accessible dialogs, loading, error and empty states.

## Run locally

Requires Node 22.13 or later. Install with `npm run install:ci`, then run `npm run build`. Apply the schema once:

```
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_shiny_rogue.sql
```

Start using `npm run dev`. Use `npx tsc --noEmit` for type checking.

## API

- `GET /api/transactions`: recent transactions and saved confirmations, 30-minute summary, server clock.
- `POST /api/claim`: JSON `{ "receipt": "DEMO000001", "claimedFor": "Faith / seat 4" }`; one irreversible claim per receipt.
- `POST /api/demo`: JSON `{ "amount": 10000 }`; amount is in cents, so this simulates KSh 100.

`payments.receipt` is a primary key. Claiming uses a single SQL `UPDATE ... WHERE claimed_at IS NULL AND received_at >= cutoff ... RETURNING *`. A second claimant cannot overwrite the original reference. No unlock endpoint exists.

## Demo and integration boundary

This is a single-merchant demonstration, hosted privately. All receipts are clearly marked DEMO and all customer names and masked phone numbers are fictional. The private hosting access policy protects the demo; the source is not a production multi-tenant payment service. Seed data is inserted only once and naturally expires from the verification window. Use “Add demo payment” to simulate arrivals later. Confirmations are never reset by reseeding.

Before real merchant use, connect an approved M-Pesa transaction feed and Super App host integration; replace the demo endpoint, add merchant identity and per-merchant authorization to every query, and validate source, currency, merchant, receipt uniqueness and payment settlement/reversal state on the server. Add an audit trail, operational monitoring, rate limits and pagination. No SMS access, live M-Pesa integration, or payment processing is implemented. No credentials are required or included.

Amounts filter instantly against the loaded dataset, capped at the latest 500 recent or confirmed receipts for this demonstration. Saved database records are retained even when not in the first 500 displayed records.

## Installable mobile app (PWA)

The app now uses a phone-sized layout, fixed bottom navigation, large touch controls, safe-area insets and a decimal keypad for amounts. `public/manifest.webmanifest` configures the home-screen name, 192/512 px icons, a maskable icon and standalone launch. Apple home-screen metadata and a 180 px touch icon are included.

Open the hosted HTTPS link on the phone, sign in if prompted, and tap **Install**. Supported Android browsers can show their installation prompt; the app also includes manual Chrome and iPhone Safari instructions. This is an installable web app, not a native APK, IPA or an app-store submission. A physical-device install has not been verified in the development environment.

The service worker never caches authenticated pages, payment responses or confirmation requests. It only provides a built-in offline navigation screen on network failure. Current-page confirmations are disabled when the browser reports being offline; server confirmation is still required in every case. Nothing is queued for later confirmation. Authentication errors pass through normally. Reopening the app or reconnecting refreshes data.

Run `node --test tests/mobile.test.mjs` to verify the manifest, icon dimensions, API bypass, offline response and authentication pass-through. The database integrity checks remain in `tests/test_claim_integrity.py`.

## Expanded demo payments

The first load of this version adds 60 new fictional receipts, spread across the previous 25 minutes. It includes 40 fictional customer profiles, masked phone numbers, amounts from KSh 20 to KSh 2,500, repeated fare amounts and 12 confirmed receipts with seat/order references. A separate versioned seed marker and insert-only receipt IDs preserve existing confirmations. This batch is added once and follows the normal 30-minute expiry rules.

Use **Add 30 demo payments** for more fresh, varied records at any time. The bulk action shows all amounts and clears the name/status filters so the new data is immediately visible. Existing locks are retained. `POST /api/demo` accepts `{ "count": 30 }` for the batch, or the existing `{ "amount": 10000 }` for a single KSh 100 payment.

## Ride sales and cash fares

The Rides tab starts a journey with a route and fare, records cash fares, and closes the journey with a saved summary. Each ride shows verified M-Pesa sales, cash sales and combined revenue. M-Pesa counts are receipts; cash entries include their passenger count. Existing receipts remain unassigned unless confirmed during a new ride. Data is persisted in D1 and can be loaded again across browser sessions.

Only one ride can be active at a time. The database enforces that constraint. Receipt confirmation assigns the receipt to the selected active ride in the same atomic update that locks it. If the ride has changed or ended, the confirmation is rejected so a stale device cannot charge a different journey. Closed rides reject new cash entries and receipt claims. Their totals remain queryable from saved rows.

Cash and ride creation requests carry a client-generated UUID. Retrying the same request returns the saved record rather than inserting another entry. Cash amounts use integer cents and are independent of the nominal fare, so group fares or partial cash payments can be recorded accurately. Recording cash is bookkeeping; the app does not move money. Ride history loads 20 records per page and ride entries load 50 per page.

API additions: `GET/POST /api/rides`, `GET /api/rides?rideId=UUID&offset=0`, and `POST /api/cash`. Claim requests include `rideId` (or null when no ride is active). Add the new database migrations in order before running locally. Hosted publication applies migrations automatically.

## Performance work

Demo initialization is shared across simultaneous requests and cached per database binding after success. A durable ready marker makes cold-worker initialization a single indexed lookup. Failed initialization can retry; insert-only seeding never overwrites receipt claims or original timestamps. Recent and historic confirmed receipts use disjoint indexed ranges, and snapshot reads are batched together. Payment data itself is never cached in the browser or service worker.

The client shares overlapping refresh requests and cancels stale snapshots after mutations. Filters/search indexes are memoized, currency/time formatters are reused, payment rows skip unchanged renders, and the clock wakes at label/expiry boundaries instead of every second. Ride screens load as a separate client chunk when opened.

Validation: `node --experimental-strip-types --test tests/optimization-and-rides.test.mjs tests/mobile.test.mjs`, `python3 -m unittest discover -s tests -v`, and `node node_modules/typescript/bin/tsc --noEmit`. The optimization tests use the actual schema migrations and SQL, compare the old/new receipt queries, check index use, and exercise duplicate cash requests, ride closure and receipt ownership. The shared hosted workspace remains a single-merchant prototype; separate owner/conductor roles and live M-Pesa integration are not implemented.
