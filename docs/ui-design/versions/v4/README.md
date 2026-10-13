# V4: a garage with many bikes

Status: **Draft for review, 2026-10-13.** Implemented in the connected web app (`apps/web`) for review; approval is still the owner's call. Builds on the approved [V3](../v3/README.md). V3 still
governs everything below except the two changes listed here.

Why: review of the running web app with a well-filled database found two problems the V1–V3 mocks
missed, because they only had two bikes:

1. **All views**: with many bikes (more than 20), the row of bike cards above the content wraps into
   several rows and pushes the content (for example the parts list) down out of view.
2. **Components**: when adding parts to a new bike, the group's "not recorded" panel closes after
   every fit, so the panel has to be opened again for each part.

Open [index.html](index.html) directly in a browser, or run
`python3 -m http.server 8080 --directory docs/ui-design` from the repository root and visit
`http://localhost:8080/versions/v4/`. The data is synthetic: 24 bikes, reference date 13 Oct 2026.
Changes live in memory until **Reset**.

## Change 1: bike switcher instead of the card row

- One compact control shows the current bike: its picture, name, make, model, kind and year, and the
  amber *N parts missing* pill when it is incomplete. Next to it: *24 bikes in your garage · 2 incomplete*.
- **Change bike** opens a panel with a search field already focused. Typing filters by name, make,
  model, kind or year. Enter picks the first match; ↑ ↓ move through the list; Esc closes it.
- Without a search, the panel lists up to three **recently viewed** bikes, then **all bikes A–Z**.
  Each row shows recorded kilometres, or the missing-parts pill for an incomplete bike.
- **Create bike** moves from the end of the card row to the bottom of the panel.
- The control takes the same height whatever the number of bikes, on every view and on a phone.

## Change 2: parts panels stay open while fitting

- Each group's *N not recorded* panel remembers whether it is open, per bike, while the page
  re-renders after a save. A group with nothing recorded yet starts open, since the panel is all it
  has.
- After a fit, the panel stays open. The new row appears in the group with a short highlight and a
  *Fitted* tag, and keyboard focus moves to the next *Fit* button in the panel.
- The Fit dialog adds **Fit, then ‹next part›**, for example *Fit, then bottom bracket*. It saves
  and opens the next empty or missing position in the same group, with the same fitting date. When
  *Also fit to the rear …* is ticked, the paired position is skipped.

## What to try

- **Change bike** → type `new` → Enter. *New build* has nothing recorded, so all three groups are
  open. Fit the fork with **Fit, then bottom bracket** and keep going through Build.
- Choose *Trail bike* (only drivetrain and tyres recorded). Open *Groupset · not recorded*, fit
  the rear derailleur, and see the panel stay open with focus on the next *Fit*.
- Search `2019`, `surly` or `gravel` in the switcher. *Winter bike* and *Road bike* are incomplete.
- Narrow the window to phone width: the switcher fills the width and the panel opens below it.

## Notes for implementation

- In the web app the card row is `BikeSelector` (`apps/web/src/components/BikeSelector.tsx`), which
  wraps (`.bike-selector { flex-wrap: wrap }`). The switcher replaces it on every view that uses it,
  including Garage. *Load more bikes* becomes loading more results inside the panel, or searching on
  the server once the garage is bigger than a page.
- The not-recorded panel is an uncontrolled `<details className="unrecorded">` in
  `features/components/Components.tsx`. It needs open state kept per bike and group outside the
  refetched data, so a save and refresh do not reset it.
- The rules in `app.js` only imitate the API. The connected client keeps showing API results.

## As implemented in `apps/web`

- Switcher rows show the missing-parts pill but no kilometres: `GET /api/bikes` does not return a
  distance, and the client does not add one up itself.
- *Recently viewed* leaves out the bike already shown on the button and lasts for the browser tab
  (session storage, bike ids only).
- Search covers the bikes loaded so far. With more than one page, the count reads *50+ bikes* and
  *Load more bikes* sits at the end of the list; server-side search is still to come.
- Focus after cancelling a chained *Fit, then …* dialog returns to the group's next *Fit*.
