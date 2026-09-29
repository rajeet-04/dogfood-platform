---
name: DOGFOOD
description: Self-hosted hackathon submission and judging platform
colors:
  signal-magenta: "oklch(0.55 0.215 9)"
  signal-magenta-hover: "oklch(0.485 0.2 7)"
  verified-teal: "oklch(0.5 0.1 188)"
  ink-50: "oklch(0.973 0.004 264)"
  ink-200: "oklch(0.878 0.009 264)"
  ink-500: "oklch(0.512 0.014 264)"
  ink-900: "oklch(0.202 0.018 264)"
  canvas-dark: "oklch(0.155 0.017 264)"
  success: "oklch(0.63 0.15 155)"
  warning: "oklch(0.74 0.155 66)"
  danger: "oklch(0.598 0.2 26)"
  info: "oklch(0.62 0.15 248)"
typography:
  display:
    fontFamily: "Unbounded, Hanken Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2.5rem"
    fontWeight: 600
    lineHeight: "2.5rem"
    letterSpacing: "-0.012em"
  title:
    fontFamily: "Unbounded, Hanken Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: "1.9rem"
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Hanken Grotesk, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.5rem"
  caption:
    fontFamily: "Hanken Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: "1.125rem"
  data:
    fontFamily: "Fragment Mono, ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.5rem"
rounded:
  xs: "2px"
  sm: "3px"
  md: "4px"
  lg: "6px"
  xl: "8px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.signal-magenta}"
    textColor: "#fdfdfd"
    rounded: "{rounded.md}"
    padding: "10px 20px"
  button-primary-hover:
    backgroundColor: "{colors.signal-magenta-hover}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink-900}"
    rounded: "{rounded.md}"
    padding: "10px 20px"
---

# Design System: DOGFOOD

## Overview

**Creative North Star: "The Ledger"**

DOGFOOD is signed infrastructure for running a hackathon, not a hackathon flyer. It is a judging platform — organizers move an event through a state machine, judges score under locked rubrics, and everyone downstream depends on an append-only audit trail. The UI is built to read like the ledger and audit record it actually is: dense, scannable, quietly confident data screens rather than a marketing surface. This is deliberately not the illustrated-poster style of Raptors' community hackathon sites, and not a generic light SaaS admin panel either — DOGFOOD earns a darker, more serious register because task completion (Operate mode), not persuasion, is the whole job.

The system commits to a near-black graphite-navy canvas as its native register (light is the companion mode, not the lead), two disciplined accents — a hot signal magenta for action and live/in-progress state, and a cold verified teal for locked, confirmed, or published state — and monospace type reserved for genuinely measured values: IDs, state codes, timestamps, scores. Bracketed labels (`[ event state machine ]`, `[run]`, `[score]`) and hairline dividers do the structural work that icon grids and cards would otherwise do elsewhere.

**Key Characteristics:**
- Near-black graphite-navy canvas as the native/default register; light mode is a re-tuned companion, not a separate identity
- Exactly two committed accents: signal magenta (action, live) and verified teal (locked, confirmed, published)
- Monospace is earned, not decorative — only on IDs, state codes, counts, timestamps
- Sharp, small radii ("a ledger has corners, not bubbles") — 2–8px, never pill-shaped cards
- Structure comes from brackets and hairlines, not icon+heading+text card grids

## Colors

The palette is desaturated and tuned onto a single cool-navy hue axis (~264°) so the two accents read as deliberate signal against a calm, unified neutral field, in both themes.

### Primary
- **Signal Magenta** (oklch(0.55 0.215 9) light / oklch(0.635 0.23 9) dark): the product's one hot color. Primary actions, live/in-progress state (the "judging" phase of the lifecycle), focus rings. Never used decoratively — its rarity is the point.

### Secondary
- **Verified Teal** (oklch(0.5 0.1 188) light / oklch(0.7 0.11 187) dark): the counterweight accent. Locked evaluations, "results ready" / "published" states, success confirmation. Cold and certain against magenta's heat.

### Neutral
- **Ink** (oklch(0.973 0.004 264) → oklch(0.128 0.016 264)): the graphite-navy ramp used for text, borders, and both canvases. All 264-hue, so nothing in the neutral scale reads as a bolted-on library gray.
- **Canvas** (`--df-canvas`): oklch(0.975 0.004 264) light / oklch(0.155 0.017 264) dark — never pure white or pure black; depth comes from layered surface steps (canvas → surface → surface-raised), not shadows alone.

### Status
- **Success** (oklch(0.63 0.15 155)), **Warning** (oklch(0.74 0.155 66)), **Danger** (oklch(0.598 0.2 26)), **Info** (oklch(0.62 0.15 248)): desaturated to the same axis discipline as the neutrals so status colors sit beside the accents without competing.

### Named Rules
**The Two-Accent Rule.** Only signal magenta and verified teal carry meaning. No third decorative accent color is ever introduced — status colors exist for state, not decoration.

## Typography

**Display Font:** Unbounded (with Hanken Grotesk, system-ui fallback)
**Body Font:** Hanken Grotesk (with system-ui fallback)
**Data Font:** Fragment Mono (with SFMono-Regular, Menlo fallback)

**Character:** Unbounded's geometric, slightly architectural forms give headings authority without softness; Hanken Grotesk carries all body reading with relaxed leading; Fragment Mono is reserved for values that are actually measured, never used as a stylistic flourish.

### Hierarchy
- **Display** (600, 2.5rem, 2.5rem line-height, -0.012em tracking): homepage hero and top-level page thesis only.
- **Title** (600, 1.5rem, 1.9rem, -0.01em): section headings.
- **Heading** (600, 1.125rem, 1.625rem, -0.006em): card and block titles.
- **Body** (400, 0.875rem, 1.5rem): default reading text.
- **Caption** (400, 0.75rem, 1.125rem): secondary metadata, table labels.
- **Micro** (400, 0.6875rem, 1rem, 0.08em tracking, often uppercase): bracketed section tags like `[run]`, `[score]`.
- **Data / tabular** (Fragment Mono, tabular-nums): IDs, codes, counts, timestamps — anywhere a value is measured rather than authored.

### Named Rules
**The Earned Mono Rule.** Monospace is applied only to genuinely measured or generated values (state codes, IDs, timestamps, scores) — never as a stylistic costume on ordinary copy.

## Layout

Content sits in a `max-w-7xl` centered container with responsive gutters (`px-4` mobile → `px-8` desktop). Sections stack with generous vertical rhythm (`py-14`–`py-20`) separated by hairline borders (`border-line-subtle`) rather than shadowed card boundaries. The homepage lifecycle strip and role-permission matrix are dense, table-like grids on desktop that stack to single-column, labeled rows on mobile — data density is preserved, not simplified away, at small widths.

## Elevation & Depth

Depth is conveyed primarily through layered surface tokens (canvas → surface → surface-raised → surface-sunken), not shadow. Shadows exist but stay understated — `--shadow-xs` through `--shadow-lg` — and read differently by theme: barely-there tints in light mode (`rgb(16 18 28 / 0.04–0.12)`), a touch deeper in dark mode (`rgb(6 8 16 / 0.2–0.4)`) since dark surfaces need more contrast to register elevation at all.

### Shadow Vocabulary
- **xs** (`0 1px 2px 0 rgb(16 18 28 / 0.04)` light): resting card/input edge definition.
- **sm/md** : hover and interactive-surface lift.
- **lg/pop**: modals, popovers, and the account switcher.

### Named Rules
**The Layered-Not-Lifted Rule.** Reach for the next surface token before reaching for a bigger shadow. Shadow signals interaction state, not static hierarchy.

## Shapes

Small, consistent radii — 2px to 8px (`--radius-xs` through `--radius-xl`) — deliberately short of the soft, pill-shaped admin-dashboard default. "A ledger has corners, not bubbles": cards, buttons, badges, and inputs all sit at the low end of this scale (3–6px), never fully rounded except the scrollbar thumb and true status dots.

## Components

### Buttons
- **Shape:** 4px radius (`--radius-md`).
- **Primary:** signal-magenta background, near-white text, `10px 20px` padding.
- **Hover / Focus:** darkens one step along the magenta ramp on hover; a single 2px `--df-ring` (magenta) outline with 2px offset on focus-visible, applied identically across every interactive element in the product.
- **Secondary / Ghost:** transparent or `surface-hover` background, ink-colored text, same radius and padding as primary.

### Cards / Containers
- **Corner Style:** 6–8px radius (`--radius-lg`/`--radius-xl`).
- **Background:** `--color-surface`, distinguished from canvas by the layered-surface step, not a shadow.
- **Border:** hairline `--color-line` / `--color-line-subtle`, the primary separator throughout the product.
- **Internal Padding:** 16–24px depending on density.

### Tables (Role matrix, results)
- **Style:** hairline row dividers, tabular-numeral alignment for any counted or scored column, bracketed `[tag]` micro-labels for grouped sections. Mobile collapses columns into labeled stacked rows rather than horizontal scroll.

### State / Lifecycle Strip (signature component)
The event lifecycle (`Draft → Registration → Submissions open → Submissions closed → Judging → Results ready → Published`) renders as a literal state-machine strip: numbered steps (`00`–`06`, tabular mono) with a top border colored by phase — neutral for setup states, signal magenta for the live judging state, verified teal for the confirmed/published states — with an explicit legend. This is the product's real spine and appears in the first viewport, not as a marketing claim beside it.

### Gallery Placeholder Tiles
Projects without a submitted thumbnail get a deterministically hashed tone from the status-soft palette (never a single repeated flat color) plus a `P-00N` tabular tag — so an unthumbnailed gallery wall of forty reads as forty distinct entries, not one broken image repeated.

## Do's and Don'ts

### Do:
- **Do** treat dark mode as the native register; verify every new surface there first, then confirm the light companion.
- **Do** ground every monospace use in a real measured value (ID, timestamp, state code, score).
- **Do** use the bracket (`[tag]`) and hairline-divider vocabulary for structure instead of adding a new card style.
- **Do** vary placeholder/fallback tiles deterministically when real content (thumbnails) is often missing — flat repetition reads as a broken image, not a design choice.

### Don't:
- **Don't** introduce a third accent color. Signal magenta and verified teal are the whole palette; status colors are for state, not decoration.
- **Don't** use an eyebrow/kicker pill above headings — hard ban.
- **Don't** build same-size icon+heading+text card grids for feature or role lists — use the manifest-list or matrix-table pattern instead.
- **Don't** round corners past `--radius-xl` (8px). Pills and fully-rounded cards break the ledger's corner language.
- **Don't** adopt Raptors' illustrated-poster/marketing register for DOGFOOD itself — that is Persuade-mode language for a different kind of site; DOGFOOD is Operate-mode and earns its brand through data precision, not illustration.
