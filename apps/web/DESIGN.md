---
name: Bike Log
description: A practical bicycle maintenance and component history interface.
colors:
  green: "#345b43"
  green-hover: "#244831"
  lime: "#e4efb0"
  ink: "#24332d"
  overview-muted: "#59675d"
  paper: "#f7f8f5"
  line: "#e5e8e1"
  white: "#fff"
  sage: "#edf1e7"
  sage-line: "#d4decc"
  active-nav: "#eef3e6"
  status-amber-bg: "#fff4da"
  status-amber-text: "#785313"
  status-green-bg: "#edf4e7"
  status-green-text: "#42612c"
  status-gray-bg: "#f0f2ee"
  status-gray-text: "#52604c"
  brand-dot: "#6c8a2f"
typography:
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.3
  section:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "18px"
    fontWeight: 650
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "11px"
    fontWeight: 600
  metric:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "24px"
    fontWeight: 600
rounded:
  control: "8px"
  selector: "12px"
  panel: "16px"
  dialog: "18px"
  pill: "20px"
spacing:
  compact: "8px"
  small: "12px"
  medium: "16px"
  large: "24px"
  section: "28px"
components:
  button-primary:
    backgroundColor: "{colors.green}"
    textColor: "{colors.white}"
    rounded: "{rounded.control}"
    padding: "11px 15px"
  button-secondary:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "11px 15px"
  text-action:
    textColor: "{colors.status-green-text}"
  text-field:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "11px 12px"
  navigation-active:
    backgroundColor: "{colors.active-nav}"
    textColor: "{colors.green}"
    rounded: "9px"
    padding: "12px"
  status-fitted:
    backgroundColor: "{colors.status-green-bg}"
    textColor: "{colors.status-green-text}"
    rounded: "{rounded.pill}"
    padding: "5px 8px"
  panel:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
  care-panel:
    backgroundColor: "{colors.sage}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "26px"
  brand-mark:
    backgroundColor: "{colors.green}"
    textColor: "{colors.white}"
    rounded: "7px"
---

# Design System: Bike Log

## Overview

**Creative North Star: "Bike Log"**

Bike Log keeps the established forest green identity, pale sage emphasis, white panels and compact controls. Its visual language supports inspecting a bicycle and recording its maintenance history with a calm, practical hierarchy.

This record describes the connected web implementation and the finished overview. It preserves the approved V1 identity, with one owner-approved change on 2026-10-14: the brand mark is redrawn as the wheel-bowl b (see Brand mark and app icons). The care-column composition remains an overview-specific decision, not a template for every screen.

**Key Characteristics:**
- Forest green actions and pale sage emphasis.
- Rounded, bordered surfaces with restrained elevation.
- Compact data presentation with explicit units and states.

## Colors

Forest green anchors actions while pale sage distinguishes maintenance context from white information panels.

### Primary
- **Forest green:** primary buttons and selected navigation; the deeper hover token reinforces action state.
- **Pale lime:** text selection within the overview and the wheel hub in the brand mark.
- **Brand olive:** the wordmark's drawn full stop only; 3.45:1 or better on every surface it sits on.

### Neutral
- **Green ink:** ordinary content and values.
- **Overview muted:** legible secondary text within the overview; this is a scoped replacement, not a claim that the global muted token has been repaired.
- **Paper and white:** application canvas and contained surfaces.
- **Line, sage, and sage line:** fine separation and care-panel emphasis.
- **Active navigation:** a quiet green tint around the current destination.

Status pairs represent service reminders, fitted components, and absent components. The darker text tokens describe the overview override; other routes retain older values. These semantic states are not secondary brand accents.

**The Action Green Rule.** Use forest green for primary actions and selected navigation; pair status color with a written state.

## Typography

**Body Font:** the incumbent system sans stack recorded in frontmatter. Compact text, medium weights and tabular mileage support a working dashboard. The current implementation also uses this stack in headings; it is not a newly approved display-face rule.

### Hierarchy
- **Title:** the overview bike name; slightly tightened tracking (−0.02em).
- **Section:** the care-panel heading; slightly tightened tracking (−0.02em).
- **Body:** overview metadata and supporting care information.
- **Label:** standard compact action labels.
- **Metric:** overview usage values, using tabular numerals and tracking (−0.02em).

The shell currently has a larger page heading (32px, weight 650, line-height 1.2), reduced at narrower widths. Tiny legacy captions and uppercase eyebrows are inherited implementation debt, not future hierarchy guidance.

## Layout

The desktop shell has a fixed left navigation rail (238px) and centered content with a maximum width (1480px), horizontal padding (42px), and top padding (38px). At 1150px the rail becomes 205px and content padding becomes 26px horizontally. At 650px navigation becomes a sticky horizontal header.

The overview alone places care before the bike: two columns (minmax(290px, 0.85fr) and minmax(0, 1.65fr)), separated by 24px. At 1150px they become minmax(250px, 0.9fr) and minmax(0, 1.1fr), with an 18px gap and vertically stacked usage rows. At 950px care and bike become one column in that order. Three usage summaries share one bordered container rather than three floating cards.

Components and activity follow in a separate content grid. Tables retain their columns inside horizontal overflow; the overview region is keyboard-focusable and receives a visible scroll hint on phones at 650px. Do not force the table itself into page-wide overflow.

## Elevation & Depth

Most surfaces are flat. Background tone, one-pixel borders and spacing provide separation. The selected bike has a one-pixel outline shadow; this is selection feedback rather than physical elevation. Dialogs and toast feedback use ambient shadows, captured exactly in the sidecar. Dialog backdrops dim and blur underlying content.

**The Flat Surface Rule.** Separate ordinary panels with background tone and fine borders; reserve ambient elevation for dialogs and transient feedback.

## Shapes

Controls use compact rounded corners; selectors are slightly softer and panels use the larger panel radius. Status pills use full rounded ends. Dialogs have their own larger radius. Borders remain thin and green-tinted; no new decorative silhouette is introduced by the overview work.

## Components

### Buttons

Primary actions use forest green with white text; secondary actions use white with a fine border. Both share compact padding, weight 600, and a minimum height of 38px. The overview service action is larger (44px minimum height and 13px text). Primary hover darkens; secondary hover adds a pale green tint. Keyboard focus uses a three-pixel green outline with a four-pixel offset. Disabled controls use reduced opacity and the default cursor. Text actions within the overview use the darker fitted-status green and a 32px minimum height.

### Inputs / Fields

White controls have a fine green-gray border, compact corners and explicit labels. Focus shifts the border and adds a pale three-pixel ring. Invalid fields carry a red border and associated error text. The sidecar keeps the native input and label together.

### Navigation

The active destination uses a pale green background, forest green text, and medium weight. Desktop links include labels; the phone shell condenses them to icons. Preserve accessible names when labels are visually hidden. Existing glyph-based icon treatments are not a reusable icon specification.

### Chips

Status pills pair written meaning with a semantic background and darker overview text. Care-panel pills use larger text and allow wrapping. A reminder is an inspection/service prompt, never a physical wear measurement.

### Cards / Containers

White cards use a one-pixel divider-colored border and panel corners, with overflow contained. Overview care uses sage and a slightly stronger border with 26px padding, reduced to 22px at 1150px. Bike presentation stays white with compact padding; metric dividers follow the row or column direction. These are variants of the same flat surface family.

### Position board

The Components screen groups catalog positions into white group panels with a weight subtotal in each heading. Fitted, missing and empty-on-purpose positions get full rows; positions never recorded fold into one "N not recorded" line per group. Missing rows use the amber attention tint and an amber pill; "None fitted" and "Not applicable (tubeless)" use the grey quiet pill. The wheel setup strip sits on sage at the top of the group holding the tubeless positions. Row actions keep Replace visible and put move, remove and history in a "More actions" menu. On phones each row stacks label and actions, then the part, then weight and kilometres. Dialogs choose a part's source with a segmented control (New part, From your garage, From another bike) and list candidates as selectable cards. Each group's "not recorded" panel remembers whether it is open, per bike, for the life of the page; a group with nothing recorded starts open. A fit keeps the panel open, marks the new row with a short green highlight and a "Fitted" tag, and moves focus to the group's next Fit. The Fit dialog offers "Fit, then ‹next part›", which saves and opens the next empty or missing position in the group with the same date.

### Bike pictures

Each bike kind has its own side-view drawing, computed from the real size M frame geometry of a reference bike: Canyon Endurace (road), Grizl (gravel), Spectral 29 (mountain), Citylite (hybrid) and Roadlite (other or not set). One shared scale keeps proportions honest, so the type shows through wheelbase, head angle, tyre width and cockpit rather than decoration. Thin strokes, green-grey tyres and rims; the frame takes the bike's colour, or the kind's default. Sources are in `docs/ui-design/drafts/bike-art-geometry.html`.

### Brand mark and app icons

The mark is a b whose bowl is a wheel: a white stem and rim with a lime hub on a square forest green tile, drawn on a 32-unit grid with a 7-unit corner radius. It replaces V1's typed "b ↗", whose arrow ran into the bowl, read as ♂ at large sizes and repeated the app's Rides and link arrow. The geometry lives once, in `src/components/brandGeometry.ts`. `Brand` draws the mark beside the "bike log" wordmark on the sign-in page and in the shell (32px on desktop, 26px on phones), hidden from assistive technology while the link carries the name "Bike Log home". The wordmark's full stop is a drawn circle, so it sits the same in every font.

`npm run icons` draws every app icon from the same geometry: `favicon.ico` (16, 32, 48), `icon.svg` with a lighter tile on dark tab strips, a full-bleed 180px `apple-icon.png`, and the manifest's 192 and 512 icons plus a maskable 512 whose figure stays inside the central safe circle. The outputs are committed; edit the geometry and regenerate rather than editing an icon file. The approved V1 preview in `docs/ui-design` keeps the old mark as a historical record.

### Bike switcher

One row shows the current bike, whatever the size of the garage (V4): its drawing, name, make, model, kind and year, the amber missing-parts pill when it is incomplete, and "Change bike". The selected-bike outline and sage fill carry over from the V1 card row. A count line beside it reads "N bikes in your garage · K incomplete". "Change bike" opens a non-modal panel under the row with search focused: recently viewed bikes (this browser tab), then all bikes A–Z; ↑ ↓ move, Enter picks the first match, Esc closes and returns focus. Create bike and loading further pages live at the panel's foot. On phones the row fills the width, the pill drops under the name and the "Change bike" text is hidden visually only.

## Do's and Don'ts

### Do:
- Do preserve the established green identity and reuse the existing CSS custom properties.
- Do keep maintenance state, lifetime mileage, and estimates explicit in text.
- Do retain keyboard focus visibility and reduced-motion behavior.
- Do keep overflowing tables within a labeled, keyboard-focusable region with a visible phone scroll cue.
- Do render groups, positions and labels from the API catalog; never list them in screen code.
- Do use amber only for "needs attention" states that never block an action.
- Do draw the brand mark and app icons from `brandGeometry.ts`; regenerate the icons after changing it.

### Don't:
- Don't use reminder colors or progress bars to imply measured physical wear or guaranteed safety.
- Don't promote the overview care-column composition into a requirement for every screen.
- Don't copy inherited low-contrast text, glyph icons, or decorative eyebrows into new surfaces.
- Don't set the brand mark in type, or use ↗ as a brand element; it means Rides and "go there".
