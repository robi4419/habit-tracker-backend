# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Development with nodemon (auto-restart)
npm start        # Production start
```

No test suite is configured.

## Environment Variables

Requires a `.env` file with:
- `DATABASE_URL` — PostgreSQL connection string
- `JWT_SECRET` — Access token signing key (15m expiry)
- `JWT_REFRESH_SECRET` — Refresh token signing key (7d expiry)
- `CLIENT_URLS` — Comma-separated list of allowed CORS origins (e.g. `https://app.com,https://mobile.app.com`)
- `PORT` — Optional, defaults to 3000

## Architecture

Express 5 app using ES modules (`"type": "module"` in package.json). All routes are async and errors propagate to the central error handler via Express 5's native async error catching — no explicit `try/catch` needed in most routes (exception: routes that use `db.connect()` for transactions need `try/catch/finally` to release the client).

**Route structure:**
- `POST /api/auth/*` — unauthenticated: register, login, refresh, logout
- `GET|POST|PUT|DELETE /api/*` — all require Bearer token via `middleware/auth.js`

**Auth flow:** JWT access token (15m) + refresh token (7d, stored in DB for rotation/revocation). Web clients receive the refresh token via `httpOnly` cookie; mobile clients (`x-client-type: mobile` header) also receive it in the JSON response body. Refresh tokens are rotated on each `/api/auth/refresh` call.

**Database:** PostgreSQL via `pg` Pool (`utils/db.js`). Table names use quoted PascalCase in the `public` schema (e.g. `public."Habits"`, `public."Users"`). IDs are nanoid strings, not integers.

**Error handling:** Throw `AppError(message, statusCode)` for known errors — `utils/errorHandler.js` catches these plus JWT errors and PostgreSQL error codes (23505, 23503, 23502, 42P01) and maps them to appropriate HTTP responses.

**Habits limit:** 40 habits per user, enforced in `POST /api/habits`.

**Entries logic (`routes/entries.js`):** `GET /api/entries?date=YYYY-MM-DD&today=YYYY-MM-DD` auto-generates missing `HabitEntries` rows for eligible habits (respects `days_of_week` for daily habits, prevents duplicate weekly entries) inside a transaction, then returns `{ daily: [...], weekly: [...] }`.

**Sessions route** (`routes/sessions.js`) exists but is not yet mounted in `app.js`.
