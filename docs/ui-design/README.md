# Bike Log UI preview — approved version 1.0

Status: **First approved visual and interaction baseline**, approved by the owner
on 2026-10-02. The unchanged archived version is [versions/v1](versions/v1/README.md),
with an asset checksum manifest. Current assets match this approved version.

Frontend planning: [web UI design](../superpowers/specs/2026-10-02-web-ui-design.md)
and [implementation plan](../superpowers/plans/2026-10-02-web-ui.md).


Open `index.html` directly in a modern browser. No build, API, database, network
connection, or third-party assets are required. Alternatively, from the repository
root run `python3 -m http.server 8080 --directory docs/ui-design` and visit
`http://localhost:8080`.

This is a standalone design prototype, not the Next.js client or proof of backend
integration. It includes synthetic bikes, rides, components, installations, and
maintenance. The predefined reference date is 1 October 2026. Displayed timestamps
follow the browser's local timezone. Changes live in memory and reset on reload;
the sidebar's Reset button restores the fixtures immediately.

Try these flows:

- Switch between the gravel and road bikes and navigate all four views.
- Edit each bike’s name from its overview. Leave the name blank to use make +
  model (as shown by the road bike). Names appear in the selector and history.
- Add a ride and inspect its allocation and updated component mileage.
- Log chain lubrication and see the distance reminder update without resetting
  lifetime usage. The reminder interval is editable.
- Open a component passport to see installation and maintenance history, with
  starting estimates separated from calculated mileage.
- Replace any fitted chain, cassette, front tyre, or rear tyre from its table
  row or component passport, or use **Replace component** to choose a part.
  **Include replaced parts** shows the old component with its history intact;
  later rides accrue to the replacement.
- Add a ride before 1 June 2026 to see the missing-chain-history notice.

Rides allocate at their start using `[installation start, installation end)`.
Maintenance validates the component's association at its performed time; component
replacement rejects dates that would invalidate existing component maintenance.

The approved visual baseline covers bike naming, cassette/tyre replacement,
starting estimates and the demonstrated reminder layout. The completed backend
now supports these domain workflows plus oil/wax selection and independent
intervals. The archived draft still uses a single fixture interval and calculates
its own synthetic totals; those calculations must not enter the connected client.

Visual and demonstrated interaction approval is distinct from approval of the new
frontend technical design/plan. Production authentication, real personal use,
React Native, deployment and backup/recovery remain separate milestones. This
prototype is not evidence of backend-connected UI behavior.
