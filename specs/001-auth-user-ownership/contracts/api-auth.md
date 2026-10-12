# Contract: API Authorization (authenticated mode)

Status: **implemented**. It applies to every route under `/api` when `AccessMode=Authenticated`.

## Request credential

`Authorization: Bearer <access token>`. The token must satisfy all of the following:

- Exact configured `Auth__Issuer`, including the trailing slash.
- `aud` equals, or as an array contains, `Auth__Audience`.
- RS256 signature valid against the issuer's OIDC metadata keys.
- Not expired, with a nonempty `sub`.
- `scope`, split on spaces, contains `Auth__Scope` (`BikeLog.Access`).

ID tokens, tokens for other audiences, and owner IDs in headers, URLs or bodies are never accepted as
identity.

## Outcomes

| Condition | Status | Body |
| --- | --- | --- |
| Missing or invalid token (any rule above) | 401 | Problem details. No token or provider error text. |
| Valid token, `(iss, sub)` not provisioned | 403 | Problem details ("no pilot access"). |
| Valid token, user disabled | 403 | Same as above. |
| Resource absent **or owned by another user** | 404 | The same shape for both, with no `currentVersion` or foreign fields. |
| List cursor created for another owner or scope | 400 | No rows. |
| Otherwise | Normal route behavior, scoped to the resolved `OwnerId`. | |

## `GET /api/me`

Uses the same gate. 200 → `{ "email": string | null, "displayName": string | null }`. In synthetic mode
it returns both values as null.

## Unprotected surfaces

`/health/ready` and OpenAPI contain no user data. Synthetic mode keeps the fixed owner and the loopback,
Development, local-database and `LocalSyntheticMode=true` restrictions. The two modes are mutually
exclusive, and authenticated mode refuses to start when settings are missing.
