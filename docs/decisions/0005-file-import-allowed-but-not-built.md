# File-based ride import allowed but not built

Decision: Bike Log may import rides from files a rider exports from their own accounts (a Strava account archive, or FIT/GPX files from Strava, Suunto, Garmin or Wahoo), but no import is built now. Rides continue to be entered by hand. Decided by the owner on 2026-10-13, following [decision 0004](0004-strava-integration-not-feasible.md), which left a rider-uploaded import source for a separate decision.

Context: decision 0004 ruled out the Strava API, whose terms forbid keeping the ride history Bike Log needs. Two other routes were checked:

| Route | Finding |
|---|---|
| Suunto Cloud API | Available free of charge, with OAuth2, workout FIT files and webhooks ([API Zone FAQ](https://apizone.suunto.com/faq)). Access is only for companies or organizations serving a public audience, not for personal use, and the API agreement, including any storage limits, is only shared during the partner application. Not pursued. |
| Rider's own export files | The Strava API Agreement and Policy cover data an application fetches through the API, not files a rider exports from their own account. EU riders also have the right to receive their personal data in a machine-readable form and pass it to another service (GDPR articles 15 and 20). Strava's account archive contains `activities.csv`, with date, distance, moving time and gear name, plus the original activity files. Allowed. |

File import is not worth building now. A manual ride is a date, a bike and a distance, which is quicker to type than exporting and uploading a file. Backfilling earlier use is already covered by each component's starting usage estimate (`initialUsageEstimateMetres`). An import would add file parsing, duplicate detection and bike matching without saving the rider work.

Alternatives rejected: the Suunto Cloud API (not available for personal use, and its terms are unseen); per-activity file upload for new rides (slower than manual entry); a one-time Strava archive import for backfill (more exact than a starting estimate, but not needed for wear tracking now).

Consequences:

- `PROJECT_PLAN.md` Phase 5 stays without an activity source. Manual entry is the only ride source.
- If an import is built later, it imports only the rider's own ride fields, keeps imported rides distinguishable from manual ones, and needs a duplicate rule, as the plan's domain rules require. The bike-matching design in the abandoned spec 003 can be reused, matching on the archive's gear name.
- If entering rides by hand becomes a chore, improve the ride form first, for example by defaulting to the last bike used and today's date.
- Revisit when riders ask to backfill ride history, or when manual entry proves to be a burden in real use.
