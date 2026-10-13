# Strava integration not feasible

Decision: Bike Log will not integrate with Strava. Strava's current API terms forbid keeping the data a maintenance log needs, so the Strava import feature ([spec 003](../../specs/003-strava-import/spec.md)) is abandoned. Rides continue to be entered by hand. Decided by the owner on 2026-10-13, resolving the feasibility question in `PROJECT_PLAN.md` section 5.

Context: Bike Log needs ride history that lasts for years, because component usage, reminders and part history are calculated from it, together with manually logged rides. The Strava API Agreement and API Policy, both effective 1 June 2026, were checked against spec 003 ([API Agreement](https://www.strava.com/legal/api), [API Policy](https://www.strava.com/legal/api_policy)):

| Policy | Rule | Conflict |
|---|---|---|
| §6.2 | Strava data may be cached for at most seven days; apart from that cache it may not be stored. | Imported rides would be kept indefinitely. |
| §5.5 | Strava data, and any data derived from it, may not be stored in a persistent index; only the transient seven-day cache is exempt. | Component totals and part history would be derived from imported rides and kept. |
| §5.4 | Strava data may not be combined with other customer data. | Imported and manual rides would be added into one total per component. |
| §6.4 | Data may be retained only as long as its original purpose needs, except for the §6.2 cache. | Lifetime part history is the purpose. |

No narrower design works. Recalculating totals from Strava on every view would still combine Strava data with manual rides, and would exceed the default rate limits of 200 requests per 15 minutes and 2,000 per day ([getting started](https://developers.strava.com/docs/getting-started/)). Deleting rides after seven days while keeping their usage would keep derived data. Spec 003 had already settled that all Strava data must be deleted on disconnect, which leaves no compliant way to keep component usage.

Points that were not obstacles: a private pilot of up to ten riders is available after a dashboard upgrade (creating an app requires a Strava subscription); webhooks cover activity creation, deletion and deauthorization ([webhooks](https://developers.strava.com/docs/webhooks/)); and the deletion rules (within 30 days of revocation, §7.4; within 48 hours of a deletion in Strava, §6.3) and the rule to show each rider only their own data (§2.3) fit the design.

Alternatives rejected: asking Strava for an exception (the written terms leave no room for this use case, and an exception could be withdrawn); keeping derived totals after the rides expire (forbidden by §5.5); importing the rider's own Strava account export (not pursued; a separate import source would need its own decision).

Consequences:

- Spec 003 and the V5 UI mock are kept for reference, marked abandoned. Their bike-matching design (confirm list, mapping, waiting rides, rides without a bike) may be reused for a future import source.
- `PROJECT_PLAN.md` no longer plans a Strava connector, webhook endpoint or provider cache. The queue-backed import milestone has no provider until another eligible source is chosen.
- Any future activity source (another provider's API or files a rider uploads) needs its own terms review and decision before work starts, as the constitution requires (principle IV).
- Revisit only if Strava's API terms change to allow keeping ride-derived data for the athlete's own use.
