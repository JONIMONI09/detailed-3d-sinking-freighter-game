# Responsive HUD & Landscape Layout

Status: **fixed and verified** on 2026-11-11 in the cloud browser at
`844x390`, `740x360` and `390x844`, plus a `1024x768` desktop check.

---

## 1. Problem

The phone-landscape screenshot showed three defects in the HUD:

1. The **schematic panel** (`HYDRODYNAMIK & SCHOTTEN-TELEMETRIE`) was expanded by
   default and extended into the bottom-left area, where the virtual thumbstick
   is drawn — both overlapped.
2. The **interaction popup** (`INTERAKTIVES SCHIFFS-OBJEKT IN REICHWEITE`) was
   taller than the remaining space and was covered by the event ticker and the
   weapon dock.
3. The **weapon dock** overflowed horizontally and showed a bright native
   scrollbar across the bottom edge.

Cause: every HUD element had fixed pixel sizes tuned for desktop, the telemetry
panel started expanded, and no height-based breakpoint existed. A phone in
landscape has roughly 300–430 px of CSS height, so the HUD consumed more space
than the viewport.

---

## 2. Change

### New breakpoint

`src/index.css` defines a height-based variant, used by every compact rule:

```css
@custom-variant short (@media (max-height: 560px));
```

### `src/components/NavalHudOverlay.tsx`

- Telemetry panel starts **collapsed** when `window.innerHeight <= 560`, so it
  cannot reach the thumbstick.
- Compact panel: `short:w-52` (13rem), `short:max-h-[46vh]`, `flex flex-col`
  with an internally scrolling body (`overflow-y-auto naval-scroll`).
- Top bar becomes **icon-only** on short viewports: button labels (`FOTO ➔ .TXT
  ANALYSE`, `EGO-ANSICHT`, `SCHOTTEN`, `RESET`, `GRAFIK & OPTIONEN`) are hidden,
  paddings and the FPS chip are reduced, so the bar stays one row at 30 px.
- Interaction popup: compact title, explanatory subtitle hidden, capped at
  `short:max-h-[44vh]` with a scrollable body, smaller action buttons.
- Event ticker and weapon dock are compacted; the dock no longer shows a
  scrollbar (`.naval-scroll-x` hides it while keeping horizontal scrolling).

### `src/components/TouchControlsOverlay.tsx`

- Joystick `112 px → 88 px`, knob `46 px → 36 px`, `LAUFEN` label hidden.
- Right action cluster scaled to 80 %, fire button `64 px → 56 px`, utility
  buttons `44 px → 40 px`, positions tightened.
- Compact state follows `matchMedia('(max-height: 560px)')`, so it reacts to
  rotation and window resizing without a reload.

### Modals

`SettingsModal` and `PhotoTxtAnalyzerModal` already used `max-h-[90vh]` /
`max-h-[92vh]` with scrolling bodies and were left unchanged.

---

## 3. Measured results

Measured in the running app inside an exact-size iframe (see section 4).

### 844 × 390 (typical phone landscape)

| Element | Rect (x, y, w, h) | Note |
| :--- | :--- | :--- |
| Top bar | 6, 6, 832, 30 | single row, icons only |
| Schematic panel | 6, 44, 208, 42 | collapsed header |
| Thumbstick | 8, 222, 88, 88 | no overlap |
| Interaction popup | 286, 140, 272, 125 | bottom 265, above ticker |
| Event ticker | 203, 303, 439, 26 | |
| Weapon dock | 36, 337, 771, 48 | fits, no scrollbar |

Overlaps: thumbstick↔panel **0**, popup↔ticker **0**, popup↔dock **0**,
thumbstick↔dock **0**.

### 740 × 360 (small phone landscape)

| Check | Result |
| :--- | :--- |
| Top bar | 728 × 30, icon cluster ends at x = 734 ≤ 740 |
| Schematic panel | 208 × 42, collapsed |
| Interaction popup | 272 × 125, bottom 250 |
| Weapon dock | 659 × 40, bottom 354 ≤ 360, `scrollWidth == clientWidth` |

### Settings modal at 844 × 390

- Modal panel: **768 × 351**, position `38, 20`, bottom **371 ≤ 390** → fits.
- Modal body is scrollable (`scrollHeight > clientHeight`), so all tabs remain
  reachable.

### Desktop 1024 × 768

The `short` variant does not apply; the desktop HUD renders as before.

---

## 4. Re-testing the layout

The built-in Playwright runner was unusable in this environment (internal
`options.mode` error), so layout checks use the cloud browser and a small
same-origin harness.

Start the dev server and open the harness — it embeds the app in an iframe of
exactly the requested viewport, so CSS media queries behave like on the device:

```bash
npm run dev -- --host 0.0.0.0 --port 3000
```

```
/tools/hud-preview.html?w=844&h=390&s=1     # single exact viewport
/tools/hud-preview.html?grid=1              # four viewports (needs a strong GPU)
```

Measurements are taken from the iframe document (`contentDocument`), e.g. the
top bar, schematic panel, thumbstick, popup and weapon dock rectangles plus
their intersection area. Screenshots were written to `artifacts/`
(generated output, not versioned).

Verification screenshots from this run:

- `artifacts/hud-landscape-844x390.png` — full landscape HUD
- `artifacts/hud-landscape-settings-844x390.png` — settings popup in landscape

---

## 5. Limitations

- Verified in a desktop Chromium cloud browser with an exact-size iframe, **not**
  on a physical phone; iOS Safari safe-area insets (`env(safe-area-inset-*)`)
  are not handled.
- The breakpoint is `max-height: 560px`. Landscape phones are covered; tablets
  in landscape (~768 px height) keep the desktop layout.
- Long interaction labels still truncate inside the compact two-button popup.
- The weapon dock remains horizontally scrollable on very narrow viewports; the
  scrollbar is hidden but touch scrolling still works.

---

## 6. Files changed

- `src/index.css` — `short` variant, `.naval-scroll-x`
- `src/components/NavalHudOverlay.tsx` — compact HUD, collapsed panel, popup cap
- `src/components/TouchControlsOverlay.tsx` — compact touch controls
- `tools/hud-preview.html` — layout harness (new)
- `RESPONSIVE_UI.md` — this record

---

## 7. Clean-room verification

The layout change was re-verified in a fresh-install pass: `node_modules`,
`dist` and the Sonnet `dist` were deleted, then reinstalled with `npm ci` from
the lockfile (no `npm install`, no peer-dep overrides).

| Command | Exit |
| :--- | :---: |
| `npm ci` | 0 |
| `npm run typecheck` | 0 |
| `npx tsc -p detailed-3d-sinking-freighter-game_sonnet/tsconfig.json --noEmit` | 0 |
| `npm test` (5 physics tests + 7 integrity checks) | 0 |
| `npx vite build` | 0 |
| `npx vite build detailed-3d-sinking-freighter-game_sonnet --outDir ../dist/sonnet --base ./` | 0 |
| `npx vite build detailed-3d-sinking-freighter-game_sonnet` | 0 |

The built `dist/index.html` contains the `max-height:560px` media query
(2 occurrences) and the `naval-scroll-x` rule (3 occurrences), so the responsive
behaviour is present in the production single-file bundle. In the English-UI
run the root bundle measured 953.59 kB (gzip 250.56 kB) and hashed to
`2e69b066…`.

---

## 8. Touch/HUD layering fix (2026-11-11)

The mobile audit found two real bugs the earlier landscape pass missed:

- The right-half touch look zone was a child of the `z-20` touch overlay, so it
  painted above the `z-10` HUD and swallowed taps on the camera, flashlight,
  bulkhead and sound buttons once the top bar wrapped on narrow screens.
- The interaction popup overlapped the expanded telemetry panel at 390 px width
  and covered the "Emergency repair" / "Blast keel" buttons.

Fix: the look zone now renders as a sibling at `z-[5]` (below the HUD), while
the joystick and action buttons stay at `z-20`; the telemetry panel starts
collapsed below 640 px width (not only below 560 px height); the event ticker is
capped at `92vw`; the HUD root uses `env(safe-area-inset-*)` padding and
`index.html` declares `viewport-fit=cover`.

Measured after the fix with `tools/hud-preview.html` in the Cloud browser:

- 844×390: 21 buttons, 0 clipped, 0 covered; top bar 832×30; dock 751/751.
- 390×844: 21 buttons, 0 clipped, 0 covered; ticker 359 px; no horizontal scroll.
- Settings: 768×351 at 844×390 and 374×810 at 390×844; 4 tabs; body scrolls
  (166/494 and 506/888); both footer buttons visible.
- Blackbox analyzer at 390×844: 374×810, 7 buttons, 0 clipped/covered.

The modal bodies scroll by design, so options below the fold are reachable
rather than cut off.

---

## 9. Sonnet edition preview (2026-11-11)

The second edition (`detailed-3d-sinking-freighter-game_sonnet/`, served at
`/sonnet/`) was measured after its English UI pass in an exact-size iframe:

| Viewport | Screen | Fully visible | Clipped | Covered |
| :--- | :--- | :---: | :---: | :---: |
| 1280×800 | Menu | 5/5 | 0 | 0 |
| 1280×800 | Settings | 20 own controls | 0 | 0 (5 background buttons intentionally behind the modal) |
| 1280×800 | Help | 6/6 | 0 | 0 |
| 390×844 | Menu / after start | 5/5 | 0 | 0 |
| 390×844 | Settings | 20 own controls | 0 | 0 |
| 390×844 | Help | 6/6 | 0 | 0 |

The settings content scrolls (978/652 px at 1280×800, 1,553/701 px at
390×844), the tab strip scrolls horizontally at 390 px (416/390), and *Done*
stays visible. After *Start Mission* the mobile ready screen shows Play,
Settings, Controls, Menu and Fullscreen with the canvas running.

Root spot checks after the Sonnet change: 1280×800 23/23 buttons, 390×844
21/21, 0 clipped and 0 covered.

The root bundle hash moves from `2e69b066…` (German Sonnet tree) to
`1c9d3b60…` although no root source changed: Tailwind's project-wide scan
includes the Sonnet source, so the generated utility CSS changes. Removing the
Sonnet folder before a root build yields `8ccb0d75…`. The root UI itself was
re-measured and is unaffected.
