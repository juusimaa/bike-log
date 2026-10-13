# V5: Strava import and bike links

Status: **Abandoned, 2026-10-13.** Strava integration is not feasible under Strava's current API terms
([decision 0004](../../../decisions/0004-strava-integration-not-feasible.md)). Kept for reference only. Mock for [spec 003, Strava ride import](../../../../specs/003-strava-import/spec.md).
Builds on [V4](../v4/README.md). Parts, maintenance and the bike switcher are unchanged and not repeated
here; the Components and Maintenance views link back to V4.

Open [index.html](index.html) directly in a browser, or run
`python3 -m http.server 8080 --directory docs/ui-design` from the repository root and visit
`http://localhost:8080/versions/v5/`. All data is synthetic (athlete "Alex Rider", reference date
13 Oct 2026). Changes live in memory until **Reset**.

Use **Preview scenario** in the top bar to start from one of three states:

| Scenario | Starts with |
|---|---|
| New owner, empty garage | No bikes, Strava not connected |
| Existing garage, not connected | Three bikes (Gravel, Road, Winter) and four manual rides |
| Connected, needs attention | The existing garage after setup, plus a new Strava bike with 4 waiting rides, 3 rides without a bike in Strava, one likely duplicate, and one ride whose bike was changed in Strava |

## What's new

- **Strava** in the main navigation, with a status dot (grey: not connected, green: connected, amber:
  something needs a decision). **Rides** shows a count of rides that need a bike.
- **Connect page**: what connecting does, and the *Connect with Strava* button. Strava's own consent
  page is not mocked.
- **Setup page** (one page, saved as a whole; nothing is imported before *Save and start import*):
  1. *Empty garage*: a confirm list of the Strava bikes, ticked except retired ones, with name, make,
     model and kind editable. Unticked bikes are ignored.
  2. *Existing garage*: for each Strava bike a choice of *link to one of your bikes*, *create a new
     bike* or *ignore*. Close matches are pre-selected and tagged *Suggested match*. A bike already
     chosen for one Strava bike is disabled for the others. Saving with an unchosen row highlights it.
  3. *Import rides from*: defaults to the earliest recorded part (or 1 January with no parts), plus the
     virtual-rides option (off by default).
- **Backfill progress** on the Strava page, including a pause for Strava's request limits that resumes
  on its own.
- **Connected page**: connection status and last sync, *Sync now* (also re-checks the last 30 days),
  the Strava bikes table with each bike's state (linked, ignored, waiting) and its actions, import
  settings (start date, virtual rides, default bike for rides without a bike), and *Disconnect*.
- **Notices** on every page while something needs a decision: a new Strava bike, rides without a bike,
  likely duplicates.
- **Rides page** across the whole garage: *All rides*, *Needs a bike* and *Possible duplicates*. Every
  ride shows its source (*Strava* or *Manual*). Waiting rides are grouped under their Strava bike with
  *Decide for all*; rides without a bike can be selected and assigned in one step.
- **Dialogs**: new Strava bike (create, link, ignore); change link and remove link, each asking whether
  already-imported rides move or stay and showing how many rides and kilometres would move; stop
  ignoring; change one ride's bike (kept even if Strava changes later, undone with *Follow Strava
  again*); same ride twice; default bike; import start date; disconnect (a warning that all Strava data is deleted, including the kilometres
  imported rides added to parts, with each bike's total before and after, and a required *I understand*
  tick).
- **Bike settings** (Overview → *Bike settings*): the bike's Strava link with *Change link* and
  *Remove link*, or, for an unlinked bike, buttons to link it to an unlinked or ignored Strava bike.

## What to try

1. *New owner*: **Connect Strava** → untick *Ella's Marin* → **Save and start import**. Watch the
   import pause and resume, then review the 3 rides with no bike under **Rides → Needs a bike**.
2. *Existing garage*: **Connect with Strava** → **Save** straight away to see the two unchosen rows
   flagged. Ignore *Old Allez*, create *Ella's Marin*, save.
3. *Connected*: **Decide** on *Checkpoint* and link it to *Winter bike*. Resolve the duplicate from
   **Rides → Possible duplicates**. Press **Sync now** on the Strava page: one ride moves because its
   bike was changed in Strava.
4. *Connected*: on the Strava page, open the menu on *Tarmac* → **Change link…** → *Winter bike* and
   compare *Move them* with *Keep them*.
5. Use **Preview only** on the Strava page to have a new bike ridden, a ride deleted, or access revoked
   in Strava. Revoking deletes the Strava data without a warning and shows a notice afterwards.
6. *Connected*: **Disconnect Strava** to see the deletion warning.
7. Narrow the window to phone width.

## Notes for implementation

- The rules in `v5.js` only imitate the API (assignment order in spec FR-015, re-check window,
  duplicate thresholds). The connected client must show API results and not reimplement them.
- The real disconnect warning also names the parts whose service reminders change; the mock has no
  parts, so it says this generally.
- Production must use Strava's official *Connect with Strava* button and attribution assets, per
  Strava's brand guidelines. The orange button and the *Strava* tag here are stand-ins.
- Storage of imported rides depends on the Strava feasibility decision (spec → Dependencies). If that
  decision limits retention, these screens need revisiting.
