# V2 — authentication design draft

Status: **Draft for review**, created 2026-10-04. V1 remains the approved baseline.

Open [index.html](index.html) directly in a browser. No build, server, external
assets or internet connection is needed. The mock uses the v1 garage and its
original synthetic fixtures, with a new authentication shell in `auth.css` and
`auth.js`. Reloading or **Reset preview** restores the starting state.

## Review the design

- Sign in with `alex@example.com` and any fictional password of 8+ characters.
  The garage always shows the predefined Alex Rider identity; entered information
  is discarded. Open the account menu at the top right and sign out.
- Follow **Create an account** to the email-verification confirmation, then
  **Preview verified account** to enter the garage.
- Follow **Forgot password?** to a generic reset-email confirmation.
- Use `error@example.com` with a fictional password for the inline sign-in error.
- Use the top preview selector for session expiration and service-error screens.
- Check the layout on desktop and mobile. Form labels, keyboard focus, native
  required/email validation, password visibility and account-menu Escape handling
  are included. Garage interactions are inherited from the v1 prototype.

## Design intent and open decisions

Keep the established sage/forest-green palette, typography, spacing and bicycle
illustration. Desktop pairs a quiet illustrated panel with a focused form;
mobile gives the form the full screen. Account controls sit in the existing
header. Session expiration leads back to sign-in, and failure messages provide
an explicit retry path. Recovery confirmation avoids revealing account existence.

The mock proposes email/password screens as a visual exploration, including
account creation and recovery. These may be hosted and branded by the selected
OIDC provider; they are **not a decision to store passwords in Bike Log**.
Provider selection, supported sign-in methods, registration versus invitation,
password policy, verification/reset link handling, and web/native session behavior
still require a technical design. The reset-email flow ends at confirmation;
provider reset and verification pages are not implemented here.

All authentication is simulated. There are no requests, emails, real accounts,
tokens, browser storage or access-control enforcement. The preview selector can
enter the garage directly. Use fictional details only. Entering the garage proves
no authentication or isolation behavior. Cross-user authorization remains an API
requirement, not a visual prototype feature. No provider, deployment or production
authentication changes are included.

## Validation

Checked in local Chromium on 2026-10-04 using direct `file://` opening: sign-in,
sign-out, registration/verification preview, recovery, inline errors, required
fields, password visibility, account-menu Escape and reset. All six selectable
screens fit 1440, 768, 390 and 320px widths without page-level horizontal overflow.
Desktop sign-in, mobile sign-in and the open account menu were visually inspected.
No JavaScript errors or HTTP requests occurred. JavaScript syntax and Git whitespace
checks passed. The copied v1 garage JS/CSS match the archived originals; v2-only
CSS contains narrow-screen footer and scrollable-table layout adjustments.
