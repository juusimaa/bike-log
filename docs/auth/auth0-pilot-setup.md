# Invite-only Auth0 web pilot setup

Status: documentation checked and provider proof passed 2026-10-09. This document contains no tenant IDs, customer addresses, codes, or credentials. The failed Entra pilot remains documented separately in `entra-pilot-setup.md` and `identity-proof-results.md`.

## Proof boundary

- Use a disposable **free** Auth0 tenant and its established Passwordless > Email connection, with one Regular Web Application and one custom Bike Log API. Do not select a paid plan, custom domain, production email service, SMS, social connection, or the newer database-connection OTP feature.
- Configure the email connection to send a **code**, disable signups, and enable it only for the Bike Log proof web application. Configure Universal Login for passwordless email; send `connection=email` from the authorization request if required to select it.
- Create exactly the two previously approved pilot customer identities administratively in the `email` connection. Actual inboxes and user IDs belong only in ignored `.local/identity-proof/`. Check whether account creation sends a verification or welcome email. The later sign-in code demonstrates inbox control.
- Register a custom API with RS256 signing and one permission, `BikeLog.Access`. Request its exact identifier as `audience`; request `openid profile email offline_access BikeLog.Access` as scopes. The probe must validate issuer, signature, expiration, API audience, and `scope` membership. An ID token is never an API credential.
- Register a confidential Regular Web Application with Authorization Code and Refresh Token grants enabled, and `http://127.0.0.1:3000/auth/callback` as the exact local callback. Enable **Allow Offline Access on the custom API** for the refresh-token check. Store the web client secret only in ignored local storage. Check actual refresh-token availability; if absent, the web session must end at access-token expiry.
- Run the probe on `127.0.0.1` only, with synthetic data and no token/code/secret logging. No production or remote application is included in this proof.

## Current provider sources

Checked 2026-10-09 against Auth0's own documentation and support articles:

1. [Pricing](https://auth0.com/pricing) lists a free tier with passwordless authentication and up to 25,000 monthly active users; no credit card is needed to sign up. The pilot uses two test accounts and no paid feature. Verify the tenant's displayed plan before creating resources.
2. [Choosing an Email Provider](https://support.auth0.com/center/s/article/Emails-to-Gmail-from-Auth0-never-arrive) limits the built-in sender to 10 emails per minute, with no delivery guarantee, and says it is suitable only for basic testing. Space code requests and inspect delivery; production email configuration is a later decision.
3. [Management API user creation](https://auth0.com/docs/manage-users/user-accounts/manage-users-using-the-management-api) documents `create:users` for passwordless connections. [Signup-off guidance](https://support.auth0.com/center/s/article/How-to-restrict-email-domains-from-registering-to-the-Passwordless-email-connection) says only registered users can use an email passwordless connection when signups are disabled. The combination remains unproven until the live result file passes.
4. [Universal Login](https://auth0.com/docs/authenticate/login/auth0-universal-login) accepts a `connection` authorization parameter. [Auth0 Support](https://support.auth0.com/center/s/article/no-connections-enabled-for-the-client) says the **Identifier First** authentication profile is required for passwordless New Universal Login; [its connection guidance](https://support.auth0.com/center/s/article/Passwordless-login-not-triggered-using-the-New-Universal-Login-with-Identifier-First-Profile) also requires `connection=email` in this flow.
5. [Regular Web Applications](https://auth0.com/docs/get-started/auth0-overview/create-applications/regular-web-apps) use a confidential server client. [Authorization Code Flow](https://auth0.com/docs/get-started/authentication-and-authorization-flow/authorization-code-flow/add-login-auth-code-flow) documents the callback and `offline_access` for refresh tokens when Allow Offline Access is enabled. [API access tokens](https://auth0.com/docs/secure/tokens/access-tokens/get-access-tokens) require the custom API audience and requested scope.
6. [Auth0's PHP web quickstart](https://auth0.com/docs/quickstart/webapp/php) uses `http://127.0.0.1:3000/` as a development callback and requires the callback URL in the application's allowlist. The pilot pins the exact `/auth/callback` path on that host and port.
7. [Auth0's token refresh guidance](https://support.auth0.com/center/s/article/Token-Refresh) places **Allow Offline Access** in the custom API settings and requires the application's **Refresh Token** grant plus the `offline_access` request scope. The live probe records whether Auth0 actually returns a refresh token.
8. [Auth0's passwordless account-creation note](https://support.auth0.com/center/s/article/verify-email-false-for-passwordless-connection-still-sending-verification-email) says `verify_email: false` is ignored for passwordless users and an unverified account may receive a verification email. The pilot leaves `email_verified` unset rather than asserting inbox control; record actual email behavior before sign-in.

## Provider settings observed on 2026-10-09

- The disposable tenant showed the Free subscription at $0. A trial banner also appeared; no paid feature or billing option was selected.
- The custom API uses RS256, has one `BikeLog.Access` permission, and has Allow Offline Access enabled. The web application has the exact loopback callback, Authorization Code and Refresh Token grants, and only the custom API's user-delegated permission.
- The passwordless email connection sends six-character codes with a 180-second lifetime and has public signups disabled. The application-side Connections page read back the email connection enabled and the default database and Google connections disabled after a reload. The connection-side enable control initially returned an error and did not persist; the application-side control did persist.
- The dashboard's Create User form lists only the database connection. Both approved pilot customers were created and read back in the `email` connection with a temporary Management API client limited to `create:users` and `read:users`. Its grant was revoked after the proof; the same token request then returned HTTP 403, and the local Management API client credential was removed. User IDs remain only in ignored local proof files. A welcome message arrived in one pilot inbox after creation.
- The initial hosted login showed a password field even though the authorization redirect included `connection=email`. The tenant's authentication profile was **Identifier + Password**. Changing it to **Identifier First** and reading it back made both existing customers reach email-code prompts without passwords. The first code arrived in spam; both callbacks were verified, and the first access-token summary showed matching issuer, audience, scope, signature, and refresh-token availability.
- Unknown addresses received the same generic code prompt. A controlled unregistered alias received no email during the three-minute code lifetime and created no user; a reserved unknown address also created no user. The generic prompt did not reveal account existence.

## Private configuration contract

Place the following in ignored `.local/identity-proof/auth0-config.json` only after the tenant is created. The probe reads this file; tracked docs use keys only.

| Key | Purpose |
| --- | --- |
| `issuer` | Exact Auth0 OIDC issuer, including trailing slash, read from discovery metadata. |
| `apiAudience` | Custom Bike Log API identifier registered in Auth0. |
| `apiScope` | `BikeLog.Access`. |
| `webClientId` | Confidential Regular Web Application client ID. |
| `redirectUri` | `http://127.0.0.1:3000/auth/callback`. |

Store the web client secret as `{ "clientSecret": "..." }` in a separate mode-600 ignored `.local/identity-proof/auth0-web-client-secret.json` file. Do not print the secret or full token response. Record tenant, app, connection, API, and test-user IDs privately, with a sanitized settings/result summary in `auth0-proof-results.md`.
