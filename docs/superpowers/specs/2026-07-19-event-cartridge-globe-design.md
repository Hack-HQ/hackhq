# Event Cartridge — Globe view redesign

**Date:** 2026-07-19
**Source design:** Claude Design project `cf508c31-…` → `Event Cartridge.dc.html`
**Scope:** The `/globe` page only. `/deck` and `/my` are untouched.

## Goal

Update the globe/explore view to match the "Event Cartridge" design: restyled
status markers with a selected state, and a left-anchored sliding detail card
("Event Cartridge") that replaces the centered `DetailModal` on this page.

The mockup was drawn with the HackHQ design system already in the repo — same
fonts (Syncopate / Inter / Space Mono) and palette (coral `#ed5b29`, open
`#17b26a`, soon `#f5a623`, closed `#6b6560`). So we reuse existing tokens and
classes (`.display`, `.kicker`, `--font-mono`, `bg-coral`) rather than importing
anything new.

The real interactive Mapbox globe is kept and restyled — we do **not** replace
it with the mockup's static CSS sphere.

## Data-model gaps and how we resolve them

The mockup's mock events carry fields the real `Hackathon` type does not.
Resolutions (confirmed with the user):

| Mockup field        | Real data | Resolution |
|---------------------|-----------|------------|
| `diff` (1–3)        | none      | Compute via `difficultyOf(h)` — hybrid heuristic (below). |
| event photo         | none      | Gradient placeholder tinted by the event's status color + scrims. No fake photography. |
| org logo            | none      | Host-initial monogram badge. |
| `dateRange` ("When")| `deadline`| Show `deadlineDisplay(h)` labeled **Deadline** (the data is the application deadline, not event dates — labeling it "When" would misrepresent it). |
| `prize` / countdown | `prize`, `countdown(h)` | Used directly. |

## Components

### 1. `difficultyOf(h)` — `web/lib/types-hq.ts`

Client-safe helper, added alongside the existing display helpers.

```ts
export type Difficulty = 1 | 2 | 3; // 1 EASY, 2 MEDIUM, 3 HARD

export function difficultyOf(h: Hackathon): Difficulty;
export const DIFFICULTY_META: Record<Difficulty, { label: string; color: string }>;
```

Heuristic (a "competitiveness / reputation" proxy, since there is no popularity
field):

1. Start `score = 0`.
2. Prize pool: `prizeValue >= 50_000` → `+2`; else `prizeValue >= 10_000` → `+1`.
3. Format: `In-Person` → `+1`.
4. Flagship name match (case-insensitive substring on `host` + `title`) against a
   small curated set → floor the result at HARD. Set:
   `hack the north`, `cal hacks`, `calhacks`, `pennapps`, `hackmit`, `treehacks`,
   `la hacks`, `lahacks`, `mhacks`, `hack the 6ix`.
5. Map score → difficulty: `>= 3` → 3 (HARD), `== 2` → 2 (MEDIUM), else 1 (EASY).

`DIFFICULTY_META`:
- 3 HARD → `#ed5b29` (coral)
- 2 MEDIUM → `#f5a623` (amber)
- 1 EASY → `#17b26a` (green)

This auto-scales as new events are added, and the flagship floor keeps
well-known prestige events at HARD even when their prize is listed as TBA.

### 2. `EventCartridge` — `web/components/hq/event-cartridge.tsx`

`"use client"`. Reads `useSelection()` and `useTracker()`. Renders `null` visual
when nothing is or was selected; otherwise a fixed, left-anchored, vertically
centered card (`width: 374px; max-width: calc(100vw - 92px)`).

Structure (mirrors the mockup):

- Behind-card coral glow.
- Card body: `#100f0f`, `1px` paper/14 border, `28px` radius, deep shadow.
- Vertical **edge index label**: `HQ · NN / MM`, where `NN` is the 1-based index
  of the selected event among the *located* events shown on the globe and `MM`
  is that count.
- **Photo block** (188px): gradient placeholder
  `linear-gradient(150deg, <statusColor>33, #1b1917 62%)` with the mockup's dot
  texture overlay + top/bottom scrims.
  - **Difficulty badge** top-right: `DIFFICULTY_META.label` + three pips
    (filled up to the difficulty level, colored by difficulty).
  - **Close** button (circle) overlapping the photo's bottom-right.
- **Logo monogram** badge overlapping the photo/body seam: host's first initial,
  coral on ink, rounded 16px.
- **Body**: host kicker (coral, mono), title (`.display`), meta chips (location
  with pin icon + format).
- **Stat panel** (3 rows): Deadline / Prize Pool / Countdown. Countdown value
  colored by status when present, muted otherwise; falls back to `NOT YET OPEN`
  (opens_soon) or `SEE WEBSITE`.
- **Actions**: Register (`REGISTER ↗`, or `VISIT SITE ↗` when `opens_soon`) —
  coral pill linking to `h.url`; Save — heart toggle wired to
  `useTracker().save`/`remove` (`♥` tracked / `♡` untracked), styled coral when
  tracked.

**Animation:** slide/rotate in when `selected` becomes set
(`rotate(-3.5deg) translateX(-135%)` → `rotate(-3.5deg) translateX(0)`, opacity
0 → 1). When `selected` clears, animate back out, then unmount after the
transition (keep the last event during the exit so content doesn't blank). When
switching directly between two events, do a brief exit → swap → enter so the new
card slides in. Under `prefers-reduced-motion`, skip transforms and just
fade/toggle.

**Dismissal:** close button and `Escape` clear the selection. No scroll lock
(this is a side panel over a fixed-height section, not a full-screen overlay).

### 3. `GlobeMap` restyle — `web/components/hq/globe-map.tsx` + `globals.css`

- Track the selected marker: when `selected` changes, set `data-selected="true"`
  on the matching marker element (and clear others). Keep a `Map<id, element>`
  built when markers are created.
- Marker click → `setSelected(h)` and a gentle `easeTo` to the marker at
  `zoom ≈ 4` (replacing the current `flyTo` to `zoom 9.5`) so the marker and the
  left card stay visible together. Keep auto-rotate pause + "Back to globe"
  reset behavior (back-to-globe also clears selection).
- Clicking the empty globe (map background `click` with no marker) clears the
  selection.
- Move the title chrome from bottom-left to **bottom-right** and add the hint
  line, matching the mockup: `Pillar 01 · Explore` / `The Globe` /
  `◉ Select a marker to inspect the event`. This clears the left-anchored card.

`globals.css` marker additions:
- `.hq-marker[data-selected="true"]` — enlarge (~18px) and add a `34px` white
  selection ring with a colored glow (via a `::after` ring or box-shadow layers),
  matching the mockup's selected dot. Closing-soon `hq-pulse` stays.

### 4. Wiring — `web/components/hq/page-shell.tsx` + `web/app/globe/page.tsx`

- `PageShell` gains an optional prop: `detail?: React.ReactNode`, defaulting to
  `<DetailModal />`. It renders `{detail}` in place of the hard-coded modal.
- `web/app/globe/page.tsx` passes `detail={<EventCartridge />}`.
- `/deck` and `/my` continue to get the default `<DetailModal />` — no change.

This avoids rendering both surfaces (which would otherwise both react to
`selected`) on the globe page.

## Non-goals / YAGNI

- No new fonts or assets — the repo already has the design system.
- No changes to the data pipeline or `Hackathon` shape (difficulty is derived,
  not stored).
- No replacement of Mapbox with a CSS sphere.
- No change to `DetailModal`, `/deck`, or `/my`.

## Testing / verification

- `difficultyOf` is pure and unit-testable: assert flagship names floor at HARD,
  prize thresholds, and format bump. Add tests if a test setup exists; otherwise
  verify by rendering.
- Manual: `/globe` renders markers; selecting one slides the cartridge in, shows
  correct status/difficulty/prize/countdown, Save toggles and persists via the
  tracker, close/Escape/background-click dismiss, `/deck` and `/my` still show
  the centered modal.
- Build must pass: `npm run build` (and lint) in `web/`.

## Notes for implementation

- Per `web/AGENTS.md`, this repo's Next.js has breaking changes vs. training
  data — consult `node_modules/next/dist/docs/` before writing framework-level
  code. This work is component-level (client components, existing patterns), so
  follow the surrounding code.
