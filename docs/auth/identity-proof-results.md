# Invite-only web identity proof

Status: **failed feasibility gate**. Date: 2026-10-08. No API or web production implementation should start from this result.

Record pass/fail and a sanitized evidence reference for each row. Keep addresses, codes, tokens, secrets, and raw provider errors out of this file.

| Check | Result | Sanitized evidence |
| --- | --- | --- |
| External tenant linked to the intended subscription; Core/A0 and no add-ons | Pass | Entra portal showed External ID Core offer and linked subscription; ARM showed Base/A0. No add-on was selected. |
| Email one-time passcode enabled; signup-off setting read back as false | Pass | Entra provider list showed email OTP configured; Graph flow readback showed `EmailOtpSignup-OAUTH` and `isSignUpAllowed: false`. |
| First administrator-created customer completes first-time email-code sign-in | **Fail** | Hosted sign-in asked for a password after recognizing the administratively created customer; it did not offer an email code. No password was entered. |
| Second administrator-created customer completes email-code sign-in | Pending | |
| Uncreated address cannot create an account | Pass at email-entry stage | Hosted page reported that no matching account was found; no code or account creation step appeared. |
| Web callback rejects wrong state, nonce, redirect, and replay | Pending | |
| Web access token has Bike Log API audience and `BikeLog.Access` scope | Pending | |
| ID token cannot serve as the Bike Log API bearer token | Pending | |
| Valid Entra identity without local Bike Log provisioning receives 403 after the API plan | Pending | |

The Expo redirect result belongs to the later native proof plan.

The password prompt is a direct observation for the Graph-created customer used in this proof. A diagnostic Graph request to create a synthetic external customer without a password was rejected with `Request_BadRequest: A password must be specified to create a new user`; no diagnostic account was created. This supports the password-backed account explanation, but does not establish that every possible Entra onboarding method behaves the same. A design change requires another proof; neither provider documentation nor the probe's unit tests can turn this failed live check into a pass.
