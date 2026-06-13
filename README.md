# AI Exercise Checker — Web App

The web version of the AI Exercise Checker (originally a Chrome extension in
[`../extension`](../extension)). It is a React + Vite single-page app with one
route per function. The Chrome extension still works and is kept as-is; this
app is a parallel, standalone front-end that talks to the same backend.

## Routes

| Route | Function | Auth |
|-------|----------|------|
| `/login` | Username/password **or** Google login | public |
| `/auth/callback` | Google OAuth redirect handler (exchanges the code) | public |
| `/forgot-password` | Request a password-reset token | public |
| `/reset-password` | Set a new password using the token | public |
| `/grade` | Select class + lesson, paste doc links, run auto-check | protected |
| `/classes/new` | Create a new class | protected |
| `/students/add` | Add students into a class | protected |
| `/signup` | Teacher sign-up (when account isn't registered yet) | protected |
| `/missing-teacher` | Shown after login if the account has no teacher record | protected |

`/` redirects to `/grade`. Protected routes redirect to `/login` when there is
no session.

## Getting started

```bash
cd web
npm install
npm run dev      # http://localhost:5173
```

The backend URL is set in [`src/config.js`](src/config.js) via `ENVIRONMENT`
(`"dev"` → `http://localhost:3000`, `"PROD"` → the Cloud Run URL). Start the
backend separately.

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite dev server |
| `npm run build` | Production build to `web/dist` |
| `npm run preview` | Serve the production build |
| `npm test` | Unit tests (vitest) — parser/writer/feedback logic |
| `node tests/e2e-smoke.mjs` | Browser smoke test (needs dev server + backend running; uses system Chrome via Playwright) |

## Google OAuth — required setup

The extension used a **Chrome-extension** OAuth client and
`chrome.identity.launchWebAuthFlow`. The web app uses a standard browser
OAuth redirect, so you must configure a **Web application** OAuth client:

1. Google Cloud Console → APIs & Services → Credentials → create/edit a
   **Web application** OAuth 2.0 Client ID.
2. Add **Authorized JavaScript origins**: `http://localhost:5173` (and your
   production origin).
3. Add **Authorized redirect URIs**: `http://localhost:5173/auth/callback`
   (and `https://YOUR_DOMAIN/auth/callback`).
4. Put the client id in `GOOGLE_CLIENT_ID` in [`src/config.js`](src/config.js).
5. **Backend:** `POST /auth/google` must exchange the authorization code using
   the **same** `redirect_uri`. The app now sends `redirect_uri` in the request
   body — the backend should use it (instead of a hard-coded extension URI)
   when calling Google's token endpoint.

Username/password login needs no OAuth setup; it works out of the box.

## How it maps to the extension

| Extension | Web |
|-----------|-----|
| `chrome.storage.local` | `localStorage` wrapper ([`src/auth/storage.js`](src/auth/storage.js), `ace_` prefix) |
| `chrome.identity.launchWebAuthFlow` | OAuth redirect → `/auth/callback` ([`src/auth/googleOAuth.js`](src/auth/googleOAuth.js)) |
| `popup.js` login/token logic | [`src/auth/`](src/auth) + [`src/api/backend.js`](src/api/backend.js) |
| `popup.js` grading pipeline | [`src/lib/`](src/lib) (`grading`, `docParser`, `docWriter`, `docTables`) + [`src/api/googleDocs.js`](src/api/googleDocs.js) |
| HTML screens (show/hide divs) | React pages under [`src/pages/`](src/pages) + the router |
| `#status` div | per-page status state |

The grading logic (doc parsing, table-index maps, feedback writing) is a
faithful 1:1 port and is covered by unit tests so results don't drift.

## Architecture

```
web/
├── index.html              app shell
├── src/
│   ├── main.jsx            React root + providers + router
│   ├── App.jsx             route table
│   ├── config.js           backend URLs, OAuth config, secret key
│   ├── auth/
│   │   ├── storage.js      localStorage token store
│   │   ├── tokens.js       ensureValidToken / ensureValidGoogleToken / refresh
│   │   ├── googleOAuth.js  OAuth redirect helper
│   │   └── AuthContext.jsx session + teacher-info state
│   ├── api/
│   │   ├── backend.js      every backend endpoint
│   │   └── googleDocs.js   Google Docs get-tab + batchUpdate
│   ├── lib/
│   │   ├── docTables.js    tab → exercise-table index maps
│   │   ├── docParser.js    extract question/answer pairs
│   │   ├── docWriter.js    build batchUpdate feedback requests
│   │   └── grading.js      orchestrates the full run
│   ├── components/
│   │   ├── Layout.jsx      header, nav menu, profile menu
│   │   └── ProtectedRoute.jsx
│   └── pages/              one component per route
└── tests/                  vitest unit tests + browser smoke test
```
