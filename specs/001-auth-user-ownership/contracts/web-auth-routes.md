# Contract: Web Auth Routes and Proxy

Status: **implemented** in `apps/web`.

| Route | Method | Behavior |
| --- | --- | --- |
| `/auth/start?returnTo=<path>` | GET | Creates a one-use login transaction (state, nonce, PKCE) and redirects to Auth0 `/authorize` with `connection=email`, the API `audience`, and `scope=openid profile email offline_access BikeLog.Access`. Unsafe `returnTo` values fall back to `/`. |
| `/auth/callback` | GET | Consumes the transaction atomically and validates state, nonce, verifier and redirect. Exchanges the code server-side, creates a session, and sets the opaque `Secure`, `HttpOnly`, `SameSite` cookie. On any failure it creates no session. |
| `/auth/logout` | POST | Same-origin only. Deletes the session, clears the cookie, uses Auth0 logout where supported, and redirects to a safe local page. |
| `/api/[...path]` | allowlisted | Requires a session (401 with zero upstream calls if missing, expired or revoked). Refreshes the token server-side, forwards only `Authorization: Bearer <server token>`, and drops browser authorization, cookie, host and forwarded headers. Cross-origin mutations → 403. Keeps the method checks, `no-store` and manual redirects. Writes are never retried. |

## Client behavior

- 401 from the proxy shows the session-expired screen and clears the query cache.
- 403 shows pilot-access recovery guidance.
- An outage offers retry. Unsent form input stays visible and is never resubmitted automatically.
- The garage provider is keyed by `(issuer, subject)`. Changing identity cancels requests and clears all
  cached data.
