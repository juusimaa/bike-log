# Contract: Health Endpoints

## `GET /health/ready` (API, loopback only)

Unchanged. It returns `200 {"status":"ready"}` when `SELECT 1` succeeds, and `503` otherwise. It needs no
sign-in and returns no record data. In hosting it can be reached only from inside the replica, because the
API binds to `127.0.0.1` and has no ingress.

## `GET /healthz` (web, public)

| Condition | Response |
| --- | --- |
| API `/health/ready` returns 200 within 3 s | `200`, body `ok`, `Cache-Control: no-store` |
| API returns non-200, times out or is unreachable | `503`, body `unavailable`, `Cache-Control: no-store` |

**Rules**:

- No sign-in required.
- The body never includes error details, host names or timings.
- Only `GET` is allowed; other methods get `405`.
- No `Host` check: platform probes send the replica IP as `Host`. The route returns no data.
- Used by the Container Apps startup and readiness probes and by the deploy workflow's final check.
  Probe requests are not billed.
