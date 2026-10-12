# Data Model: Invite-Only Sign-In and Per-User Ownership

All entities below **already exist** (migration `20261009051928_AddAuthenticationOwnership`, additive).
Phase A changes no schema. Phase B adds no server schema.

## BikeLogUser

`src/Infrastructure/Persistence/BikeLogUser.cs`

| Field | Type | Rules |
| --- | --- | --- |
| `OwnerId` | UUID | Primary identity for ownership. Newly generated at provisioning and unique. Never reuses an existing owner and never equals the synthetic owner `11111111-1111-1111-1111-111111111111`. |
| `Issuer` | string, required | Exact Auth0 issuer, including the trailing slash. |
| `Subject` | string, required | Auth0 `user_id` (`sub`). `(Issuer, Subject)` is unique and immutable. |
| `Enabled` | bool | `false` → every API request is refused with 403. |
| `Email` | string? | Mutable profile snapshot. Never used for authorization. |
| `DisplayName` | string? | Mutable profile snapshot. |

**States**: `Enabled` ⇄ `Disabled`, changed only by operator commands. There is no deletion in this
feature; account lifecycle is a later milestone.

## WebSession

`src/Infrastructure/Persistence/WebSession.cs`. Contents are owned by the web app.

| Field | Type | Rules |
| --- | --- | --- |
| `SessionIdHash` | string, PK | Hash of the random opaque cookie value. The raw ID is never stored. |
| `EncryptedTokens` | string | AES-GCM envelope (access, refresh, expiry). The key comes from secret configuration. |
| `Issuer`, `Subject` | string | Identity the session belongs to. Used to key the client cache. |
| `ExpiresAtUtc` | timestamp (UTC) | Expired → 401 from the proxy and the session-expired UI. |
| `RotationVersion` | int | Compare-and-swap on refresh. Only one concurrent rotation wins. |
| `CreatedAtUtc`, `UpdatedAtUtc` | timestamp (UTC) | |

## OidcLoginTransaction

`src/Infrastructure/Persistence/OidcLoginTransaction.cs`

| Field | Type | Rules |
| --- | --- | --- |
| `StateHash` | string, PK | Hash of the OIDC `state`. Consumed atomically once. |
| `EncryptedNonceAndVerifier` | string | Nonce and PKCE verifier, encrypted. |
| `ReturnPath` | string | Safe local path only. Other values fall back to `/`. |
| `ExpiresAtUtc`, `CreatedAtUtc` | timestamp (UTC) | Expired → callback fails and no session is created. |

## Existing owned records (unchanged)

Bikes, components, installations, rides, maintenance records, reminder rules and usage projections
each carry `OwnerId` with composite `(OwnerId, Id)` relationships. The purge deletes them in this order:
usage projections → maintenance → installations → rides → reminder rules → components → bikes, filtered
by the synthetic owner.
