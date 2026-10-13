# V3: component groups, weights and full bike positions

Status: **Approved by the owner on 2026-10-13** as the UI design for
[feature 002](../../../../specs/002-component-groups-weight/spec.md). It extends the approved V1
baseline: V1 still governs everything this feature does not change, and V3 governs the parts view,
part dialogs, wheel setup, incomplete-bike states, usage gap summaries, weights and frame weight.

Open [index.html](index.html) directly in a browser, or run
`python3 -m http.server 8080 --directory docs/ui-design` from the repository root and visit
`http://localhost:8080/versions/v3/`. No build, network or backend is needed. The data is synthetic, the
reference date is 13 Oct 2026, and changes live in memory until **Reset**.

## What to try

- **Components** for each bike. Parts are grouped into Build, Groupset and Wheels, with a weight
  subtotal per group and a bike total. Fitted parts, missing parts and empty-on-purpose positions get
  full rows; positions never recorded collapse into one "N not recorded" line per group.
- **Road bike is incomplete.** Its saddle was taken for the gravel bike on 12 Oct, and its rear wheel
  went back to tubed on 15 Sep without a tube. See the selector badge, the notice and the amber rows.
- **Fit the road bike's saddle.** The dialog offers *New part*, *From your garage* (the old WTB saddle)
  and *From another bike* (the Fizik on the gravel bike, with the warning that the gravel bike becomes
  incomplete).
- **Replace** any fitted part with the same three sources; the old part goes to the garage.
- **Fit a front brake lever** on the gravel bike: *Also fit to the rear brake lever* is offered and
  ticked by default.
- **Wheel setup** at the top of Wheels: switch a wheel to tubeless (a fitted tube comes out) or back
  to tubed (the tube becomes missing). Open *Tubeless history*.
- **Front derailleur** on the gravel bike shows *None fitted*; on the road bike, use the row menu to
  mark it none fitted.
- **More actions** (⋯) on a fitted part: move to another bike (into an empty or occupied position),
  remove, or open its history. **Parts in your garage** lists unfitted parts with *Fit to a bike*.
- **Overview**: usage gaps summarised per position, weight by group and frame, and the incomplete
  notice. **Edit bike** adds the frame weight.
- **Rides**: each ride shows *N positions not recorded* instead of a label per position.
  **Add a ride** on the road bike warns about the missing parts but still saves.
- Enter weights such as `0`, `12.5` or `20001` to see the field errors.

## Design notes

- Keeps the V1 identity, shell and bicycle illustration. New surfaces follow `apps/web/DESIGN.md`:
  text at least 12px, darker muted and status text, drawn SVG icons, and no eyebrows. The shell's small
  captions were raised to the same minimum.
- Amber means "needs attention" (missing parts, incomplete bikes) and never blocks an action. Grey
  means recorded as empty on purpose, or not recorded yet.
- Groups and positions are rendered from one catalog list, so adding a group or position adds rows
  without layout changes (research note D13).
- The phone layout stacks each row as label and actions, then the part, then weight and kilometres.
  The page never scrolls sideways.

The rules in `app.js` only imitate the API so the flows can be clicked through. The connected client
must display API results and must not reimplement allocation, completeness or overlap rules.
