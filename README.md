# LipaVerify — HTML app and server source

## Run the HTML app

Open **index.html** in a modern browser. The complete application JavaScript and styling are embedded in that file. No React installation, backend server, sign-in or build step is needed to run the HTML version.

The HTML app includes saved routes, repeating past journeys, fare changes, QR fare previews, random passengers, underpayment warnings, two-receipt top-ups, group payments, cash at ride completion, refund records and earnings by date range.

Records are saved in localStorage on the same browser and device, namespaced by the hosting folder. They are not shared across phones, accounts or browsers; clearing site storage removes them. Local file storage behavior varies between browsers, so HTTPS hosting is recommended. Keep real merchant credentials and payment integrations on a server. This is a sample-money simulator, not live M-Pesa processing. The browser’s saved receipt locks are demo state and can be changed by someone with access to that browser’s storage.

## Host on GitHub Pages

The ready-to-run **index.html** is committed at the repository root. The existing GitHub Actions Pages workflow deploys it without a Node build. Open **Actions → Deploy static content to Pages** to follow deployment. If Pages is not enabled, use **Settings → Pages → Source: GitHub Actions**, then run that workflow.

Keep `manifest.webmanifest`, `sw.js`, `.nojekyll`, and `public/icons/` alongside the HTML for optional installation and offline support. The app uses relative URLs, so it works under `/Test-1/` as well as a domain root. Only `index.html` is needed for the application itself. Hosting requires no API URLs or secrets.

## Rebuild after editing the source

Use Node 22.13+ and pnpm. Run `pnpm install --frozen-lockfile`, then `pnpm build:html`. Commit the regenerated `index.html`, `sw.js` and `manifest.webmanifest` together with your source changes.

- `static/entry.tsx` starts the browser app using the shared phone UI.
- `static/browser-api.ts` implements the browser-only ledger.
- `scripts/build-html.mjs` bundles all app JS/CSS inline.
- `pnpm check` runs the complete project checks; `node --experimental-strip-types tests/browser-ledger.test.mjs` checks the standalone ledger.

## Server-backed version

The Cloudflare D1 application remains in `app/`, `db/`, `drizzle/`, and `worker/`. Run `pnpm dev` / `pnpm build` for that version. Its backend provides owner-scoped records and shared database locks; GitHub Pages does not execute that server code. The hosted server version is https://lipa-verify-instant.glossygull16.chatgpt.site/ (sign-in required).

See `docs/server-app.md` for the original server development and integrity documentation, and `docs/legacy-webpage.md` for the earlier standalone demo documentation.

## Saved routes and repeat journeys

In Journeys, use **Add route** to save the starting point, destination and default fare. Use **Start ride** to prefill a new journey, adjust that ride’s fare if needed, then start. The start form also lets you pick any saved route or a recent ride. **Repeat route** on a completed ride copies only the route and fare into the form; **Save this route** keeps those details for later. Each start creates a new session ID with zero cash, receipts and passenger confirmations. Earlier receipts, cash and locks stay on the original ride. Saving or editing a template never changes a current or completed ride. You can save/edit routes while another ride is active, and start the next ride once the current one ends. Existing browser records are preserved.

The combined **Update & regenerate fare QR** action has been removed. Fare editing and regular QR generation remain separate controls.

## Prototype analysis assistant

Tap the bot icon in the header, or **Ask your ride analyst** in Earnings. Choose a period and an optional ride, then use suggested questions or type a question. The assistant reports collections, cash, refunds, top earning ride sessions, confirmed passenger counts, unverified receipts and receipt-level shortfalls. It checks the complete stored ledger rather than the 30-minute feed. Answers show their period, ride scope and snapshot time; asking again refreshes the data. Explicit today/yesterday/week/month/date phrases update the period.

This is a clearly labelled **local analysis prototype**, using intent matching and deterministic calculations, not a connected AI language model. Unsupported questions receive a capability explanation. No AI service receives data, no credentials are embedded, and chat answers never mutate receipts or journeys. `/api/analysis` returns aggregate records without payer names or receipt codes; the server implementation scopes every query to the authenticated owner. Refunds retain original passenger confirmations, cash does not add passengers, and shortfall counts exclude already combined/verified or refunded receipts. Shortfalls are per receipt and are not a claim of lost income.
