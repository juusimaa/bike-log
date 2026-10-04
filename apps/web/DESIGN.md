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
---

# Design System: Bike Log

## Overview

**Creative North Star: "Bike Log"**

Bike Log keeps the established forest green identity, pale sage emphasis, white panels and compact controls. Its visual language supports inspecting a bicycle and recording its maintenance history with a calm, practical hierarchy.

This record describes the connected web implementation and the finished overview. It preserves the approved V1 identity; the care-column composition remains an overview-specific decision, not a template for every screen.

**Key Characteristics:**
- Forest green actions and pale sage emphasis.
- Rounded, bordered surfaces with restrained elevation.
- Compact data presentation with explicit units and states.

## Colors

Forest green anchors actions while pale sage distinguishes maintenance context from white information panels.

### Primary
- **Forest green:** primary buttons and selected navigation; the deeper hover token reinforces action state.
- **Pale lime:** text selection within the overview and existing brand detail.

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

## Do's and Don'ts

### Do:
- Do preserve the established green identity and reuse the existing CSS custom properties.
- Do keep maintenance state, lifetime mileage, and estimates explicit in text.
- Do retain keyboard focus visibility and reduced-motion behavior.
- Do keep overflowing tables within a labeled, keyboard-focusable region with a visible phone scroll cue.

### Don't:
- Don't use reminder colors or progress bars to imply measured physical wear or guaranteed safety.
- Don't promote the overview care-column composition into a requirement for every screen.
- Don't copy inherited low-contrast text, glyph icons, or decorative eyebrows into new surfaces.
