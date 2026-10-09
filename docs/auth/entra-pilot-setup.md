# Invite-only Entra web pilot setup

Status: web feasibility gate failed on 2026-10-08; see `identity-proof-results.md`. This document contains no tenant secrets or customer addresses. Actual proof identifiers and observations belong in ignored `.local/identity-proof/`.

## Chosen proof boundary

- A disposable **external** tenant named for Bike Log pilot work, with `Europe` data location and `FI` country code. The linked Azure resource group is dedicated to this proof.
- Core/A0 tier only. Azure resource creation requested `Standard` / `A0`; the provisioned ARM resource reports `Base` / `A0`, and the Entra portal reports **Entra External ID Core offer** linked to the intended subscription. Do not enable SMS, Go-Local, premium add-ons, or another paid option.
- One Bike Log API registration exposing delegated `BikeLog.Access`, and one confidential web registration requesting that scope. Use `http://127.0.0.1:3000/auth/callback` for the local callback; production redirect configuration is a later decision.
- Two administrator-created **customer** accounts whose actual email addresses are confirmed by the operator; an uncreated address is used only for signup-off denial. Do not use an admin address as a customer address.
- Provider-generated codes and any secret or token stay outside source, logs, screenshots, and tracked evidence.

## Current source checks

Checked 2026-10-08 against Microsoft documentation:

1. [External tenant creation](https://learn.microsoft.com/en-us/entra/external-id/customers/quickstart-tenant-setup) requires an Azure subscription and Tenant Creator role. The `Europe` location cannot be changed after creation. The tenant can take up to 30 minutes to provision.
2. [External ID pricing](https://azure.microsoft.com/en-us/pricing/details/microsoft-entra-external-id/) lists Basic as free for 0–50,000 monthly active users; premium add-ons have no free tier. [Billing guidance](https://learn.microsoft.com/en-us/entra/external-id/external-identities-pricing) says an external tenant must be linked to a subscription. This proof uses only Basic with two test people; check the tenant's billing view after creation.
3. [Customer user flow setup](https://learn.microsoft.com/en-us/entra/external-id/customers/how-to-user-flow-sign-up-sign-in-customers) permits email one-time passcode as the first-factor sign-in method. [Signup-off guidance](https://learn.microsoft.com/en-us/entra/external-id/customers/how-to-disable-sign-up-user-flow) requires a Microsoft Graph update to `onInteractiveAuthFlowStart.isSignUpAllowed=false`; verify the readback rather than relying on UI appearance.
4. [Customer account creation](https://learn.microsoft.com/en-us/entra/external-id/customers/how-to-manage-customer-accounts) describes administrator-created external users. The combination with signup disabled still requires the live proof in `identity-proof-results.md`.

## Operator sequence

1. Record the new tenant's issuer/metadata URL, tenant ID, API audience, scope, web client ID, and exact redirect URI in ignored local notes. Keep client credentials in local secret storage.
2. Enable email one-time passcode in the external tenant, create the customer flow, and attach only the web app.
3. Set signup off through Microsoft Graph and read the setting back. Do not substitute password sign-in or enable public signup to make the proof pass.
4. Create two customer accounts from confirmed test addresses. Keep the account IDs and addresses in local notes only.
5. Run the local web redirect probe, then fill the sanitized results table. If first-time sign-in or denial fails, stop before the API/web production flow.

## Observed gate failure

The external tenant, web app association, and customer flow were configured. Microsoft Graph read back `isSignUpAllowed: false` and `EmailOtpSignup-OAUTH`; the hosted page denied an uncreated address. However, a customer account created administratively through Microsoft Graph with an `emailAddress` identity and required local-account password profile reached an **Enter password** page on first sign-in. No email-code prompt appeared. The live proof therefore does not establish the approved onboarding combination. The API and web implementation plans remain gated pending an owner-approved onboarding revision and a successful repeat proof.

Native client registration and the Expo redirect proof follow the working web milestone in `docs/superpowers/plans/2026-10-08-native-auth-proof.md`.
