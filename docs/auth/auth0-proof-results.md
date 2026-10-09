# Invite-only Auth0 web identity proof

Status: **passed** on 2026-10-09. Both approved existing customers completed email-code sign-in, the unknown-address denial held, and the web callback verified an API access token.

Keep customer addresses, codes, tokens, client credentials, tenant identifiers, and raw provider errors out of this file. Record only dated, sanitized observations.

| Check | Result | Sanitized evidence |
| --- | --- | --- |
| Free disposable tenant, custom API, confidential web app, email-code connection configured | Pass | Dashboard showed Free at $0; custom API, scoped web client, callback, and code connection were created and read back on 2026-10-09. |
| Public signup disabled and settings read back | Pass | Email connection showed signups disabled; after reloading the app's Connections page, only the email connection was enabled. |
| Account creation did or did not send verification/welcome email | Pass | A welcome message for the web app arrived after account creation in one pilot inbox; no operator assertion of email verification was made. |
| First administrator-created customer completes first-time email-code sign-in | Pass | The first existing email-connection customer reached the hosted code prompt without a password. The code arrived in spam, was entered by the inbox owner, and completed the local callback. |
| Second administrator-created customer completes first-time email-code sign-in | Pass | Auth0 accepted the existing customer's email code. A fresh code exchange reached the local callback, which returned true for issuer, audience, scope, subject, and refresh-token availability and logged only “verified”. |
| Unknown address cannot create an account or receive a usable code | Pass | A reserved unknown address and a controlled unregistered inbox alias received the same hosted code prompt. Management API readback found zero users for both; the inbox owner confirmed no alias email arrived during the three-minute code lifetime, so no usable code was available. |
| Callback rejects wrong state, nonce, redirect, invalid signature, and replay | Pass | Nine focused probe tests passed on 2026-10-09, covering state, nonce, redirect, signature, and one-use callbacks; synthetic requests with missing session or code returned generic HTTP 400. |
| Verified access token has exact issuer, Bike Log API audience, and `BikeLog.Access` in `scope` | Pass | The callback verified the access-token RS256 signature against Auth0 JWKS and returned true for issuer, audience, scope, and subject checks. |
| ID token and wrong-audience token cannot serve as Bike Log API credentials | Pass | The probe accepts only a JWKS-verified RS256 access token with the exact API audience and required scope. A focused test rejects a validly signed token with another audience; an ID token has the web-client audience and fails that check. Product API enforcement remains a later plan. |
| `offline_access` yields a refresh token, or bounded-session fallback is recorded | Pass | The first successful code exchange returned a refresh token; the proof reported availability only and discarded the token. |
| No address, code, token, or secret appears in tracked files or screenshots | Pass | The probe emits boolean checks and sanitized success/failure messages only. The current tracked-file audit found no tenant identifier, pilot address, one-time code, token, or credential value; private proof files are ignored and mode 600. |

The separate API plan later checks that a valid Auth0 identity without local Bike Log provisioning receives 403. The native plan repeats signup-off, code, and API-token checks on an Expo device after the web milestone.
