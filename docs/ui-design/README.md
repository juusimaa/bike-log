# Bike Log UI preview

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

The preview explores bike naming, cassette/tyre replacement, starting estimates, and
user-defined reminders beyond the current chain-only backend slice. These are UI
examples, not implemented API capabilities. The name, visual direction, and
layouts remain proposals. Production ownership, persistence, editing conflicts,
and full domain validation still belong to the eventual client/backend work.
