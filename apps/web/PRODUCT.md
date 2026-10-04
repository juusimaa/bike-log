# Bike Log

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The project owner is the primary user: a cyclist managing multiple bikes,
component usage and maintenance history. A small private pilot follows later;
public release is a separate milestone.

## Product Purpose

Help the rider understand which components are fitted, how much use they have
accumulated, and what maintenance has been performed or is due. Success means
quick ride and maintenance entry and mileage totals whose history can be explained.

The project also provides practical experience with React/Next.js, React Native,
ASP.NET Core and later Azure deployment.

## Operating Context

This record applies to the Next.js web app in `apps/web`. The required React
Native client is a later delivery milestone with separate screen implementations
and the same backend domain rules. Phone-browser use remains web use.

The core workflow is to select a bike, inspect its fitted components, log a manual
ride, record maintenance, and replace a component while preserving its history.
The existing web interface has overview, components, rides and maintenance views.

The current connected milestone runs locally with synthetic data. Authentication
and ownership enforcement are prerequisites for real personal records or remote
exposure. The standalone previews also use synthetic data and do not demonstrate
backend integration or authentication.

## Capabilities and Constraints

- Track multiple bikes and dated installations of chains, cassettes, and front
  and rear tyres.
- Allocate a whole ride using its start timestamp and installation intervals
  `[start, end)`. Missing history is an allocation gap, not guessed usage.
- Keep component lifetime usage, current-installation usage and usage since
  maintenance distinct. Service does not reset lifetime usage; replacement
  creates a new component identity and preserves the old history.
- Distinguish user-entered starting estimates from calculated usage.
- Keep mileage and installation rules in the backend; clients display API results.
- Reminders prompt inspection or service. They do not measure physical wear or
  guarantee that a bicycle is safe.
- Manual rides are the core path. External activity imports, cloud deployment,
  offline mobile operation and AI are not prerequisites for that path.
- React Native remains required, but is not implemented by this web context.

Open decisions include the identity provider, supported sign-in methods,
registration versus invitation, and web/native session behavior. V2's simulated
email/password forms do not commit Bike Log to storing passwords.

## Brand Commitments

Use Bike Log as the current product name. V1 is the approved visual and interaction
baseline; V2 authentication remains a draft for review. Preserve that approval
boundary in future work. This product record does not select a new visual style.

## Evidence on Hand

Paths below are relative to the repository root:

- `PROJECT_PLAN.md`: product purpose, domain rules and staged roadmap. Proposed
  technologies and future capabilities are not evidence of shipped behavior.
- `README.md` and `docs/web-workflows.md`: current local connected milestone and
  supported workflows.
- `docs/ui-design/README.md` and `docs/ui-design/versions/v1/`: approved standalone
  visual and interaction reference using synthetic fixtures.
- `docs/ui-design/versions/v2/README.md` and its preview: draft authentication
  exploration; all authentication is simulated.

## Product Principles

1. Preserve component identity and dated history across maintenance and replacement.
2. Explain usage honestly, including estimates and missing installation history.
3. Make routine ride and maintenance entry straightforward across bikes.
4. Share authoritative backend rules across web and the planned native client.
5. Build the useful manual workflow before optional integrations and cloud features.
