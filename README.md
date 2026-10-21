# LipaVerify — a single-file webpage

Open **index.html** in a browser. No React, package installation, development server or build step is required. The CSS, JavaScript, icons used in the interface and mock payments are embedded in the HTML.

## Features

- Mobile layout, light/dark themes and large tick-off buttons.
- Active fare controller automatically filters matching mock payments.
- Last 15 minutes, 30 minutes, 1 hour and Today (Africa/Nairobi) filters.
- First-name search. Receipt rows display only first name and transaction code.
- Permanent tick-off state in the same browser's localStorage.
- Overview totals, manual demo payments and optional 18-second demo stream.

Browser storage must be available to save fare changes and receipt claims. Local HTML file storage behavior varies by browser; serving the webpage over HTTPS is the most reliable option. These are demo locks, not atomic locks shared across devices.

## Share the webpage

Upload these static files to any HTTPS static host. Use this directory as the website root. **index.html** is the entry point. No build command is required.

Optional phone-install files are included: manifest.webmanifest, sw.js and the icon files. They use relative paths so the same webpage can be hosted in a subdirectory, such as a GitHub Pages project site. Installation needs HTTPS (or localhost); opening the HTML directly still runs the webpage without installation.

To use GitHub Pages, select the repository's main branch and root folder as the publishing source in Settings → Pages. The live app is also available at https://lipa-verify-mini-angi.glossygull16.chatgpt.site .

## Demo and backend boundary

Payments are fictional. Updating the fare does not change an actual M-Pesa QR prompt. Real merchant authentication, authoritative fares, confirmed payment callbacks and atomic receipt claims require a backend. The optional service worker caches only the demo webpage and its install assets, never payment APIs. Offline screens cannot confirm real payments.

Previous React implementation remains available in repository history.
