# syncle-services

Node.js + TypeScript backend for [Syncle](https://github.com/troy/syncle). Owns canonical `pageContextId` and `selectionContextId` for context extracted by the `syncle-ui` Chrome extension.

v1 uses an in-memory store and a stub chat responder (no OpenAI or other API keys).

## Requirements

- Node.js 20+

## Setup

```bash
cd syncle-services
npm install
```

## Run locally

Development (watch / hot reload on port **3001**):

```bash
npm run dev
```

Production build:

```bash
npm run build
npm start
```

Optional environment variables (see `.env.example`):

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | HTTP listen port |
| `GOOGLE_CLIENT_ID` | — | Chrome extension OAuth client ID |
| `JWT_SECRET` | dev placeholder | Signs session tokens after Google sign-in |
| `AUTH_REQUIRED` | `false` | Require `Authorization: Bearer` on `/context/*` and `/chat` |
| `CONTEXT_TTL_MS` | `86400000` (24h) | In-memory context TTL |
| `PRUNE_INTERVAL_MS` | `300000` (5m) | Background expiry sweep interval |

## Google sign-in

1. Copy `.env.example` → `.env` and set `GOOGLE_CLIENT_ID` + `JWT_SECRET`.
2. Configure the same client ID in the extension `manifest.json` (`oauth2.client_id`).
3. `POST /auth/google` with `{ "accessToken": "..." }` from `chrome.identity.getAuthToken`.
4. Use returned `token` as `Authorization: Bearer <token>` when `AUTH_REQUIRED=true`.

See `syncle-ui/docs/AUTH.md` for the full setup.

## Health

```bash
curl http://localhost:3001/health
# {"ok":true}
```

## API (v1)

### `POST /auth/google`

Exchange a Google OAuth access token for a Syncle session JWT.

### `GET /auth/me`

Returns `{ user: { sub, email? } }` when `Authorization: Bearer` is valid.

### `POST /context/page/register`

Register page + initial selection. Returns canonical IDs.

**Request**

```json
{
  "schemaVersion": "1",
  "extractorVersion": "syncle-ui@0.1.0",
  "pageFingerprint": "sha256:…",
  "canonicalUrl": "https://example.com/article",
  "pageContext": {},
  "selection": {}
}
```

**Response** `201`

```json
{
  "pageContextId": "pc_…",
  "selectionContextId": "sel_…"
}
```

### `POST /context/selection/register`

Register a new selection for an existing page context.

**Request**

```json
{
  "schemaVersion": "1",
  "extractorVersion": "syncle-ui@0.1.0",
  "pageContextId": "pc_…",
  "pageFingerprint": "sha256:…",
  "selection": {}
}
```

**Response** `201`

```json
{
  "selectionContextId": "sel_…"
}
```

### `POST /chat`

Stub LLM reply (echo + short context summary).

**Request**

```json
{
  "schemaVersion": "1",
  "extractorVersion": "syncle-ui@0.1.0",
  "pageContextId": "pc_…",
  "selectionContextId": "sel_…",
  "message": "What is this about?"
}
```

**Response** `200`

```json
{
  "reply": "…",
  "stub": true,
  "pageContextId": "pc_…",
  "selectionContextId": "sel_…",
  "summary": {
    "pageTitle": "…",
    "selectionText": "…",
    "canonicalUrl": "https://example.com/article"
  }
}
```

## CORS

Allowed origins:

- `chrome-extension://…`
- `http://localhost` (any port)
- `http://127.0.0.1` (any port)

## Project layout

```
src/
  index.ts              # App entry, CORS, server
  routes/               # HTTP handlers
  services/             # contextStore, chat stub
  types/                # Zod schemas & response types
  lib/                  # config, IDs, validation helpers
```
# syncle-services
