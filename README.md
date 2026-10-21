# Lipa Verify — M-Pesa merchant verification frontend

Phone-first React 19 + Tailwind CSS 4 + Vite foundation for a mobile web-view.

The interface uses a single column capped at 480px, a sticky app header, and bottom Payments / Overview / Help navigation. Payment verification stays on its own screen; summaries and demo controls are available in Overview. Dialogs open as thumb-friendly bottom sheets, with safe-area spacing and controls at least 44px tall. A web app manifest and home-screen icons support standalone display on compatible browsers. This remains a web app; no native Android/iOS package or offline payment verification is included.
This is a functional frontend prototype using fictional transaction data.

## Run locally

Use Node.js 22.12+ (or another Node version supported by Vite 7).

```bash
npm ci
npm run dev
```

Open the URL printed by Vite. Production: `npm run build`; serve `dist/` with any static host. No external CDN is needed.

## Code map

| File | Responsibility |
| --- | --- |
| `src/main.jsx` | React interface, active fare state, storage, incoming demo payments, dialogs, claim actions |
| `src/domain.js` | Pure amount/time/name/status filters, Nairobi day boundaries, fare validation, immutable claim locks |
| `src/mock-transactions.json` | 29 fictional receipts with varied amounts, names and relative timestamps |
| `src/styles.css` | Tailwind import, brand tokens, desktop/mobile layouts, dark theme, touch targets |
| `src/domain.test.js` | Meaningful filter, validation and claim tests |
| `vite.config.js` | React and Tailwind build plugins |

## Behavior

- Default fare: KSh 100; default rolling range: 30 minutes.
- Change fare with preset amounts or a positive custom amount with up to two decimal places.
- Fare and time filters always combine. The selected fare applies to all transactions in the window, including receipts received before the fare changed.
- Quick ranges: 15 minutes, 30 minutes, one hour and Today. Today uses Africa/Nairobi midnight. Future receipts are excluded.
- Receipt rows display only the customer’s first name and transaction code, alongside the tick-off / claimed control. Amounts and timestamps remain available internally for filtering.
- Search matches customer names case-insensitively. Status tabs narrow the feed further.
- Tick off binds the receipt ID to its paying customer, amount and claim timestamp. It is greyed out and the claim action is disabled; there is no unclaim action.
- Fare, receipts and claims persist in localStorage on the same browser. Other tabs receive storage updates. This is a convenience for the demo, not an atomic multi-device lock.
- Browser storage failure is reported; the UI does not mark an unsaved receipt as claimed.
- Optional vibration uses `navigator.vibrate` where the browser and device support it. Visual feedback works without haptics.
- Add demo payment inserts a fictional receipt at the current fare. Optional stream adds one every 18 seconds while the page is open.
- Mock timestamps are anchored when the app first opens. The clock refreshes every 10 seconds, so receipts naturally age out. Use Add demo payment to add fresh examples later.
- At a glance follows the fare and time window; name/status filters affect only the displayed list.
- No phone numbers, credentials, real financial records or secret API keys are included.

## Production integration boundary

The active fare currently updates only this frontend's stored state. It does not alter a standard static M-Pesa QR sticker or any real payment prompt.

A production design can keep the physical QR constant by pointing it to a merchant-specific payment entry page. That page must fetch the authoritative fare from a backend before initiating an approved payment flow. The backend must own fare changes, authenticate merchant access, validate payment callbacks, deduplicate transaction IDs and push confirmed receipts to the frontend.

Suggested integration contract (not implemented):

| Operation | Responsibility |
| --- | --- |
| `GET /api/merchant/fare` | Current authoritative amount and fare version |
| `PUT /api/merchant/fare` | Authenticated fare update, with conflict detection |
| `GET /api/transactions` | Confirmed receipts scoped to the authenticated merchant |
| `POST /api/transactions/:id/claim` | Atomic claim with a unique constraint; return HTTP 409 if already claimed |
| Server-sent events or WebSocket | Stream confirmed receipt updates and claim changes |

Use server-confirmed data and timestamps for real verification. Cross-device claims must be enforced in the database; localStorage can be edited or cleared and simultaneous tabs can race. An idempotent claim request and a unique merchant/transaction constraint are required. No M-Pesa Super App SDK or live payment integration is included in this first frontend output.

## Verification

```bash
npm test
npm run build
```

Four domain tests cover linked fare filtering, rolling boundaries, future receipt exclusion, name/status filtering, irreversible duplicate claims, Nairobi midnight and invalid amounts. Production build passed. Browser QA verified the 480px phone layout, 54px claim controls, fare-linked filtering, first-name search, claim persistence after reload, and bottom Overview navigation. Physical-device and Super App web-view testing are still required.

## Install the app on a phone

This version is a Progressive Web App (PWA), installed through a compatible phone browser rather than a separately signed APK.

- Open the deployed HTTPS app in your main phone browser and sign in if prompted. Tap **Install app**. Chrome shows its native install confirmation when available.
- Android fallback: browser menu → Install app / Add to Home screen.
- iPhone/iPad fallback: Safari → Share → Add to Home Screen → Add.
- Open LipaVerify from the new home-screen icon. The installed app uses a standalone window on supporting browsers.
- Installation and standalone status depend on the browser. In-app browsers may require opening the link in Chrome or Safari.

The install UI listens for `beforeinstallprompt` and `appinstalled`, handles acceptance/dismissal and provides manual instructions when a prompt is unavailable. It hides the main install banner in standalone mode. Installation is always initiated by the user.

The production build creates `dist/sw.js` with a content-versioned precache of the app shell, icons, manifest and bundled JS/CSS. It checks the app-shell marker before caching HTML, bypasses API/auth/cross-origin/query requests, and returns authorization failures rather than replacing them with offline content. Cached demo UI is used only on a network failure for the app root. Updates wait for existing app windows to close before activation. Development mode does not register a service worker.

Once the offline shell has been cached successfully, the interface and previously saved mock data remain usable without connectivity. An offline banner makes this explicit. No offline mode can confirm new real M-Pesa payments. Browser eviction or cleared site data removes the demo cache and local receipt locks.

The tests include offline shell fallback, auth/API bypass, login-page cache rejection and the first-visit connection requirement. A physical-device installation still needs to be confirmed by the user in their phone browser.
