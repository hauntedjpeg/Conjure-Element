# PRD — CSS → Figma Inspector

**Working name:** Conjure Element
**Type:** Cross-browser extension (Chrome + Safari). Clipboard-only — no companion plugin.
**Audience:** Personal tool. Built for my own workflow; public release is optional and not a design constraint.
**Status:** Draft v3

> Decisions taken after this draft are recorded in [decisions/](decisions/).
> Where they differ from the text below, the decision wins:
> §7.3 state forcing is superseded by [0002](decisions/0002-state-forcing-order.md).

---

## 1. Problem

Two recurring frictions when replicating web UI in Figma:

1. **Style archaeology is slow.** Native DevTools shows matched rules, computed values, and inherited values in three different places, with overridden declarations struck through across a scrollable list of rules. Answering "what is the complete, final set of styles on this element, and where did each one come from" takes minutes of scrolling and cross-referencing. Interaction states are worse — force `:hov`, re-read the whole panel, repeat.
2. **No translation layer.** Even with all the CSS in hand, I have to manually reason about what `backdrop-filter: saturate(180%) blur(20px)` or `box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.1)` becomes in Figma — and, more importantly, what *can't* survive the trip.

## 2. Goals

- **G1.** Select any DOM element and see every applied CSS property in one flat, sorted, searchable view — with provenance (which rule, which stylesheet, what it overrode).
- **G2.** Switch the element into any interaction state (`:hover`, `:focus`, `:active`, `:disabled`, …) **one at a time**, and see what changed relative to default.
- **G3.** For each property, show the Figma equivalent alongside it, annotated with a fidelity grade so I know what will be lost before I start rebuilding.
- **G4.** Copy to Figma **entirely through the clipboard**, at three granularities: a single property, a set of properties, or the whole element. What is on screen is what gets copied — including the active state.

## 3. Non-goals

Explicitly out of scope:

- **A companion Figma plugin.** Decided against. Everything ships through the clipboard.
- **Component sets / variants / prototype reactions.** These require the plugin API. States are copied individually and assembled by hand in Figma if needed. (§8.4)
- **Local relay / WebSocket transport.** Cut with the plugin.
- Capturing all states simultaneously — one active state at a time, by design (§7).
- Responsive / multi-viewport capture
- Full-page capture (element subtrees only)
- Animations and `@keyframes` (detected and reported, not converted)
- Reverse direction (Figma → CSS)
- Store distribution, Firefox, accounts, telemetry, sync

---

## 4. Platform constraints

### 4.1 No `chrome.debugger`

Because Safari is a first-class target, the Chrome DevTools Protocol is off the table. This removes two things DevTools gets for free:

- `CSS.getMatchedStylesForNode` — the cascade. **Reimplemented in a content script** (§6).
- `CSS.forcePseudoState` — the `:hov` toggle. **Reimplemented via stylesheet rewriting** (§7).

These are the two largest pieces of engineering in the project.

### 4.2 Safari specifics

- Safari supports the WebExtensions API (MV3), but extensions must be wrapped in a macOS app bundle. Build path: `xcrun safari-web-extension-converter` → Xcode project.
- For personal use, an unsigned extension runs via **Develop → Allow Unsigned Extensions**, but this **resets on every Safari restart**. Accept the friction or pay for a developer account and sign locally. Decide before M0.
- Do **not** build the UI as a DevTools panel. `browser.devtools` support in Safari is partial and historically unreliable. Use an **in-page overlay UI** injected by the content script, toggled from the toolbar action.
- **WebKit sanitizes HTML written to the clipboard**, stripping comment nodes. Payload markers must be carried in `data-metadata` / `data-buffer` *attributes* to survive. This is load-bearing for the entire product now — verify at M4, not at the end.
- **Clipboard writes must happen synchronously inside a user gesture.** Safari is stricter than Chrome here. Consequence: **payloads are pre-computed on selection and on state change, never inside the click handler.** The click handler does nothing but `navigator.clipboard.write()` on an already-built `ClipboardItem`.

### 4.3 Architecture

```
packages/
  core/          # Pure TS: cascade engine, state engine, IR builder,
                 # Figma mapping registry. No extension APIs. Node-testable.
  fig-clipboard/ # Kiwi payload authoring: node payloads and property payloads.
                 # Wraps/forks fig-kiwi. Isolated so schema churn is contained.
  extension/     # MV3. Content script + overlay UI + background worker.
  safari/        # Xcode wrapper project (generated, then committed).
```

`core` and `fig-clipboard` having zero extension dependencies is a hard rule — all the correctness risk lives there and it needs to be testable without a browser harness.

**Overlay UI must live inside a closed shadow root** with `all: initial` on the host, or the inspected page's styles will bleed into the inspector.

---

## 5. Feature: element selection

### 5.1 Picker

- Toolbar action toggles inspect mode; `Esc` exits.
- Hover highlights the element with a box-model overlay (content / padding / border / margin bands), plus a label showing tag, id, classes, and dimensions.
- Click freezes selection and opens the panel.
- **Breadcrumb** of the ancestor chain, clickable, so I can walk up to the container that actually owns the layout.
- Keyboard: arrow keys traverse parent / child / sibling from the current selection.

### 5.2 Shadow DOM traversal

`document.elementFromPoint()` does not pierce shadow boundaries. Requirements:

- Resolve the true target via `event.composedPath()[0]` on pointer events, falling back to recursive `shadowRoot.elementFromPoint()`.
- The breadcrumb renders the **composed tree**, marking shadow boundaries visibly (e.g. `my-card › #shadow-root › .header`).
- Handle slotted content correctly: a slotted node's *DOM* parent and its *flattened tree* parent differ, and **inheritance follows the flattened tree**. Resolve inherited values via the `assignedSlot` chain, not `parentElement`.
- **Closed shadow roots are inaccessible.** Detect and surface an explicit "closed shadow root — cannot inspect" state rather than silently showing wrong data.

### 5.3 Frames

- Inject into all frames (`all_frames: true`) so same-origin iframes are inspectable.
- Cross-origin iframes: not inspectable. Show a clear badge; do not fail silently.

---

## 6. Feature: complete style resolution

The core engine. Given an element, produce a `ResolvedStyle` map:

```ts
type PropertyOrigin = {
  value: string;
  selector: string;          // the specific compound selector that matched
  specificity: [number, number, number];
  important: boolean;
  layer: string | null;      // @layer name
  source: { href: string | null; line?: number };
  conditions: string[];      // enclosing @media / @supports / @container
};

type ResolvedProperty = {
  property: string;
  computedValue: string;     // from getComputedStyle — the ground truth
  usedValue?: string;        // resolved px for layout-dependent props
  winner: PropertyOrigin | 'inline' | 'ua-default' | 'initial';
  overridden: PropertyOrigin[];   // losers, in cascade order
  inheritedFrom: Element | null;  // set if the value came from an ancestor
  isCustomProperty: boolean;
  resolvedVariables?: { name: string; value: string; definedOn: Element }[];
};
```

Resolution runs against **whatever state is currently active** (§7). There is one `ResolvedStyle` at a time, plus a cached copy of the default state for diffing.

### 6.1 Stylesheet collection

Collect from all of:

- `document.styleSheets`
- `document.adoptedStyleSheets`
- Per shadow root: `shadowRoot.styleSheets` and `shadowRoot.adoptedStyleSheets`
- Inline `style` attributes
- Presentational attribute hints (`width`, `bgcolor` on legacy elements)

**Cross-origin stylesheets throw `SecurityError` on `.cssRules`.** Workaround: the background worker refetches the `href` using host permissions, and the content script parses the text into a `new CSSStyleSheet()` via `replaceSync()`, which yields readable `cssRules` with no CORS taint. Cache fetched text keyed by URL + ETag.

### 6.2 Rule traversal

Recurse through all grouping rule types, tracking enclosing conditions:
`CSSMediaRule`, `CSSSupportsRule`, `CSSContainerRule`, `CSSLayerBlockRule`, `CSSLayerStatementRule`, `CSSScopeRule`, `CSSStartingStyleRule`, `CSSImportRule`.

Only evaluate rules whose conditions currently match (`matchMedia`, `CSS.supports`) — but **retain non-matching ones in a collapsible "inactive rules" section**, since knowing a `@media (min-width: 768px)` block exists is useful context.

### 6.3 Matching

- Split selector lists on commas and match each compound selector **individually** — specificity is per-compound, not per-rule.
- Use `element.matches(compound)` for the base case.
- **Pseudo-elements:** `matches()` rejects them. Strip the trailing `::before` / `::after` / `::marker` / `::placeholder` / `::selection`, match the remainder, and read values from `getComputedStyle(el, pseudo)`. Pseudo-elements get their own tab.
- **State pseudo-classes** are handled separately — see §7.
- **Shadow-specific selectors:** handle `:host`, `:host()`, `:host-context()`, `::slotted()`, `::part()` manually; `matches()` will not resolve them from outside the root.

### 6.4 Specificity and cascade ordering

Implement specificity as `(a, b, c)`, with correct handling of:

- `:where()` → contributes 0
- `:is()`, `:not()`, `:has()` → take the highest specificity of their argument list
- `::before` etc. count as elements (c), not pseudo-classes (b)

Sort by: **origin & importance → cascade layer → specificity → source order**, with `!important` reversing origin precedence. Inline styles slot above author rules; `!important` inline above that.

### 6.5 Inherited values

Maintain a table of inherited properties. For any property not set on the element itself, walk the flattened-tree ancestor chain to find the nearest element that set it, and record that element as `inheritedFrom`. Render distinctly, with a clickable link to the source ancestor.

### 6.6 Distinguishing authored from UA-default

`getComputedStyle` returns ~350 properties with no indication of which were authored. To separate them: create a hidden same-origin iframe with an empty document, insert a bare element of the same tag name, and read its computed style as the UA baseline. Cache per tag name. Any property matching the baseline with no matched rule is a UA default, **hidden by default** behind a "show all computed" toggle.

This is what makes G1 work. The default view shows ~30 authored properties, not 350.

### 6.7 Custom properties

- Resolve the full `var()` chain and show each hop, including which ancestor defines each custom property.
- Show fallback values used vs. ignored.
- Custom properties are the cleanest bridge to **Figma variables** — flag them in the mapping panel.

### 6.8 Panel UX

- **Flat view by default.** One list, grouped by category (layout / box / typography / color / effects / other), searchable by property name or value. This is the headline improvement over DevTools' rule-by-rule presentation.
- Each row expands to show provenance and the full override stack.
- Filter chips: `authored only` / `inherited` / `overridden` / `changed in this state` / `has Figma equivalent` / `no Figma equivalent`.
- Every row is a copy target (§9.5).

---

## 7. Feature: interaction states

**Design decision: one state at a time.** The panel always reflects exactly one active state, and that state is what gets copied. No simultaneous multi-state capture, no state matrix, no bulk sweep.

This is a deliberate simplification with three benefits: page mutation is minimal and short-lived; the copy semantics are unambiguous (what you see is what you copy); and the engine only ever resolves one cascade at a time, so §6 needs no changes.

### 7.1 Detect statically, resolve on demand

Two-phase, and the split matters for both performance and page safety:

**Phase 1 — detection (on element selection, cheap).** Scan collected rules for state pseudo-classes and state-like attribute selectors whose non-state portion matches the element, an ancestor, or a sibling. Produces only a *list of available states* and their trigger elements. No page mutation, no cascade resolution.

**Phase 2 — resolution (on state selection, on demand).** Force the chosen state, re-run §6, diff against the cached default. One state, one mutation, immediately reverted if the user switches away.

### 7.2 States in scope

| State | Trigger | Forcing method |
|---|---|---|
| `:hover` | pointer | Class substitution (§7.3) |
| `:focus` | focus | Class substitution; `element.focus()` available as an oracle (§11) |
| `:focus-visible` | keyboard focus | Class substitution |
| `:focus-within` | descendant focus | Class substitution on the container |
| `:active` | pointer down | Class substitution only |
| `:disabled` / `:enabled` | attribute | Attribute set on an offscreen clone |
| `:checked` / `:indeterminate` | property | Property set on an offscreen clone |
| `:invalid` / `:valid` / `:required` / `:placeholder-shown` | form state | Offscreen clone |
| `:target`, `:open`, `:popover-open` | document / element state | Class substitution |
| `[aria-*]`, `[data-state]`, `[data-*]` | attribute | Attribute set on an offscreen clone |
| `:visited` | history | **Not capturable.** `getComputedStyle` deliberately lies for privacy. Report as unavailable. |

Attribute-driven states matter more than they look — Radix, Headless UI, and most modern component libraries express state as `[data-state="open"]` rather than pseudo-classes. Detection should offer any rule that differs from the element's current attributes by exactly one attribute condition.

### 7.3 State forcing via class substitution

The replacement for `CSS.forcePseudoState`:

1. Take the rules identified in Phase 1 for the selected state.
2. Rewrite each, substituting the pseudo-class for a marker class: `:hover` → `.__insp-hover`.
3. Inject as a constructed stylesheet, appended after all author sheets in the same cascade layer.
4. Add the marker class to the trigger element.
5. Re-run §6 resolution.

**Why class substitution specifically:** a pseudo-class has specificity `(0,1,0)` and so does a class. Swapping one for the other preserves specificity *exactly*, so the cascade outcome is faithful. Do not use attribute selectors or IDs.

This yields **real computed values**, not merely declared ones — `var()` chains resolve, shorthands expand, inheritance applies. That is the difference between this and static analysis of stylesheet text.

### 7.4 Trigger location

`:hover` on the selected element is the easy case. These are not, and all appear constantly in real component CSS:

- **Ancestor-triggered:** `.card:hover .title` — mark the ancestor.
- **Sibling-triggered:** `.input:focus + .label`, `.peer:checked ~ .panel` — mark the sibling.
- **`:has()`-triggered:** `.card:has(button:hover)` — mark the descendant.
- **Pseudo-element target:** `.btn:hover::after`.

The state chip must **name its trigger**: *"Hover on `.card` (ancestor)"* beats *"Hover."* If multiple distinct hover triggers affect one element, list them as separate selectable states rather than merging.

### 7.5 Why synthetic events don't work

Recorded so it isn't re-attempted: dispatching `mouseover` / `pointerover` via `dispatchEvent` **does not trigger CSS `:hover`**. Untrusted events do not affect the hover chain. Synthetic events will trigger *JS-driven* changes (class toggles, inline styles set by React handlers), which is separately useful, but is not a substitute for CSS state forcing.

`element.focus()` **does** genuinely trigger `:focus` — the one state available for real.

### 7.6 Panel UX

- State chips in a single row: `Default · Hover · Focus · Active · Disabled`. Only detected states appear; the rest are absent, not greyed. Detection is Phase 1, so this row populates instantly.
- Selecting a chip forces the state and holds it until another chip is selected. **The state is pinned by definition** — there is no separate pin control, because there is only ever one active state.
- The panel shows a **diff by default**: 4 changed properties, not 30 unchanged ones. Full resolved view behind a toggle.
- Each changed property shows `default → state`, with transition metadata inline: `background-color: #2563eb → #1d4ed8 (200ms ease-out)`.
- A persistent banner while any non-default state is active: *"Forcing :hover — copies will use this state."* This is the guard against copying the wrong thing.

### 7.7 Transitions

Capture `transition-property`, `-duration`, `-timing-function`, `-delay`, plus `@starting-style` blocks, and pair each animated property with its delta. Report `@keyframes` names referenced by `animation`.

Figma has no clipboard-reachable target for these (§8.4), so they are **annotation only** — surfaced in the panel and included in the copy report, not converted.

### 7.8 Cleanup guarantee

State forcing mutates the live page. Requirements:

- All injected artifacts use a single reserved prefix, removed on state change, deselect, panel close, and `beforeunload`.
- Attribute-driven states operate on an **offscreen clone**, never the live node, to avoid triggering the page's own handlers or mutation observers.
- A `MutationObserver` watchdog reverts anything left behind if the page re-renders mid-capture.
- Because only one state is ever active, the teardown surface is a single sheet and a single class — substantially smaller than a multi-state sweep would require.

---

## 8. Feature: Figma translation

### 8.1 Mapping registry

A declarative registry in `core`, one entry per CSS property or property pattern:

```ts
type Mapping = {
  cssProperty: string | RegExp;
  fidelity: 'exact' | 'approximate' | 'partial' | 'none';
  figmaProperty: string | null;   // e.g. 'cornerRadius', 'effects[].DROP_SHADOW'
  transform: (value: string, ctx: ElementContext) => FigmaValue | null;
  note?: string;                  // shown when fidelity !== 'exact'
};
```

Source of truth for the display panel (§8.3), the property payload builder (§9.5), and the node payload builder (§9.6). One definition, three consumers.

### 8.2 Known mapping landscape

**Exact:** `border-radius` → `cornerRadius` (incl. per-corner) · `opacity` · `box-shadow` → `DROP_SHADOW` / `INNER_SHADOW` · `overflow: hidden` → `clipsContent` · `mix-blend-mode` → `blendMode` · `background-color` → SOLID fill · `letter-spacing` · `text-decoration` · `text-transform`

**Approximate:**
- `display: flex` → auto layout. No `flex-wrap` parity; `align-content` has no target.
- `display: grid` → `layoutMode: 'GRID'`. Supports `HUG` and `FLEX` tracks (≈ `fr`); no `minmax()`, `auto-fit`/`auto-fill`, or named areas.
- Gradients → gradient fills. **Requires real math**: CSS angles → Figma's `gradientTransform` 2×3 matrix. Most common source of "looks subtly wrong."
- `font-weight: 600` → the Figma font *style string* `"SemiBold"`. Family-dependent and lossy.
- `filter` → only `blur()` maps (`LAYER_BLUR`). `backdrop-filter: blur()` → `BACKGROUND_BLUR`. `brightness`, `contrast`, `saturate`, `hue-rotate` have no equivalent.
- `transform` → rotation only. No skew, no 3D.
- `border` → stroke. Per-side widths supported; per-side *colors* are not.
- `line-height: normal` → must resolve to concrete px.

**None:** `position: sticky` · `z-index` (Figma is pure layer order) · most `clip-path` · `mask-image` · `text-shadow` · `will-change`, `contain`, `isolation` · `@media` · `@keyframes` · transitions

**Special:** CSS custom properties → Figma variables.

### 8.3 Panel presentation

Side-by-side columns: `CSS property | CSS value | Figma property | Figma value | fidelity`.

Fidelity as a colored indicator with a hover note:

> `backdrop-filter: saturate(180%) blur(20px)` → `effects: [{type: 'BACKGROUND_BLUR', radius: 20}]` — **partial**: "Figma supports the blur; the 180% saturation has no equivalent and will be dropped."

Summary strip: *"18 map exactly · 6 approximate · 4 will be lost."* Clicking the lost count filters to those.

### 8.4 States in Figma

Component sets, variants, and prototype reactions require `combineAsVariants()` and `reactions` — **plugin API only, therefore out of scope**.

The clipboard workflow instead is: force a state, copy, paste; switch state, copy, paste. Each paste lands as an independent layer. Assembly into a component set is manual in Figma, which is a handful of clicks and something I'd likely want to control anyway.

Two affordances to make this painless:

- **Name layers by state.** A node payload copied under `:hover` names its root `Button — Hover`, so `Cmd+Opt+K` on the accumulated layers produces a sensibly-named variant set immediately.
- **Include transition metadata in the copy report** (§9.8) so I know to set Smart Animate to 200ms Ease Out when wiring the prototype manually.

Encoding a full component set directly into a Kiwi payload is theoretically possible — `.fig` files do contain symbol and variant data — but it is a deep reverse-engineering effort with no fallback path. Not in v1, and probably never.

---

## 9. Feature: clipboard export

**Decision: clipboard only.** `Cmd+Opt+C` / `Cmd+Opt+V` (Paste Properties) has been verified to behave as needed, so property-level application works without a plugin.

### 9.1 The two payload types

Figma's clipboard is `text/html` containing two empty spans with `data-metadata` (base64 JSON) and `data-buffer` (base64 Kiwi binary, magic header `fig-kiwi`). Both node copies and property copies use this envelope with different message contents.

| Copy action | Payload | Paste in Figma | Result |
|---|---|---|---|
| Copy element | Node payload | `Cmd+V` | New layer tree on canvas |
| Copy all styles | Property payload | `Cmd+Opt+V` | Applied to selected layer(s) |
| Copy one property | Sparse property payload | `Cmd+Opt+V` | That property applied to selection |

`fig-kiwi` reads and writes this format, and Grida authors payloads from its own editor for pasting into Figma, so writing is proven. Isolate all of it in `packages/fig-clipboard`.

### 9.2 Authoring by diff, not from scratch

Do **not** attempt to construct Kiwi messages from the schema upward. The practical bootstrap:

1. In Figma, copy a real layer's properties with `Cmd+Opt+C`.
2. Decode the payload and commit it as a fixture template.
3. To emit a property, clone the template and mutate only the relevant fields.

This sidesteps most schema archaeology and gives a known-good baseline to diff against when Figma ships a format change.

### 9.3 Sparse payloads

The open risk in v2 was whether Figma's Paste Properties is all-or-nothing — whether pasting a shadow would also clobber the target's fill and radius.

The relevant insight: **we control what we author.** Kiwi messages use optional fields, so a payload that carries only `effects` has no fill or radius to apply. Figma's own copy emitting a dense payload doesn't constrain what it will *accept*. Whether Figma's paste handler iterates present fields or reconstructs a full property set with defaults is the thing to establish empirically.

**Probe matrix — run first, before building anything on top (§11).** Author minimal payloads carrying exactly one property each and observe what Figma does to a target layer with known, distinct existing properties:

| Payload contains | Expected | Watch for |
|---|---|---|
| `effects` only | Shadow applied, fill untouched | Fill reset to default |
| `fillPaints` only | Fill applied, radius untouched | Radius zeroed |
| `cornerRadius` only | Radius applied | Stroke removed |
| Empty properties message | No-op | Layer wiped |

If any row wipes unrelated properties, sparse authoring is dead for that field, and the fallback is a coarser granularity: copy *all* visual properties at once and accept the overwrite, which is still useful for "make this Figma layer look like that web element."

### 9.4 Pre-computation and the gesture constraint

Safari requires clipboard writes to happen synchronously within a user gesture. Kiwi serialization of a large subtree is not instant. Therefore:

- Build all three payload variants **on selection and on state change**, in the background, cached.
- The click handler does nothing but `navigator.clipboard.write(cachedItem)`.
- Write both `text/html` (the real payload) and `text/plain` (a readable CSS fallback, useful when pasting anywhere else).
- Ensure markers survive WebKit sanitization by carrying them in `data-metadata` / `data-buffer` attributes rather than raw comments.

### 9.5 Copy affordances and paste discovery

The two paste shortcuts are the main UX hazard — pasting a property payload with `Cmd+V` will silently do nothing useful. Mitigations:

- Every property row has an inline copy button. Multi-select rows to copy several at once.
- A copy action header for the whole element and for all styles.
- **Every copy fires a toast naming the paste shortcut**: *"Copied box-shadow — select a layer in Figma and press ⌘⌥V."* Not optional; this is the primary discovery mechanism.
- Toast also states the active state when it isn't default: *"Copied 4 properties (:hover state)."*

### 9.6 Node payload: intermediate representation

Serialize the selected subtree to JSON — resolved fills, strokes, effects, typography, layout mode, and **`getBoundingClientRect()` for every node as ground truth** — then convert to Kiwi. The rect serves as both an absolute-positioning fallback and a verification signal.

Root layer naming follows §8.4 when a non-default state is active.

### 9.7 Layout strategy

Hybrid, per node:

- `display: flex` with in-flow children → auto layout, mapping `flex-direction`, `gap`, `padding`, `justify-content`, `align-items`.
- `display: grid` → grid auto layout where the template is expressible.
- Everything else, plus any `position: absolute/fixed` child → absolutely positioned child in a fixed-size frame.

**Fidelity vs. editability is the central tradeoff.** Pure absolute positioning is pixel-perfect but produces an unusable pile of frames; inferred auto layout is editable but drifts. Ship a user-facing toggle (`Faithful` / `Editable`) rather than picking one.

### 9.8 Assets and fonts

- Images: fetch in the **background worker** (host permissions bypass CORS), embed as image paints in the payload. Respect `object-fit` → `scaleMode`.
- `<canvas>`, `<video>`, WebGL, complex SVG filters: rasterize to PNG, insert as image fill, flag as flattened.
- Inline SVG: attempt vector conversion; fall back to raster.
- **Fonts are riskier without a plugin.** There's no `listAvailableFontsAsync()` to check against, so missing families surface only after pasting. Mitigation: maintain a local list of fonts known to be present in my Figma, populated manually, and warn pre-copy on anything unrecognized.

### 9.9 Copy report

Shown at copy time, not paste time (nothing runs inside Figma). Lists what was dropped: unsupported properties, unrecognized fonts, rasterized nodes, flattened effects, transition metadata to wire manually. Same data model as §8.3.

---

## 10. Milestones

| # | Deliverable | Exit criteria |
|---|---|---|
| M0 | Cross-browser scaffold | Toolbar action toggles a shadow-root overlay in Chrome and Safari. Safari signing decided. |
| M0.5 | **Clipboard probe** | §9.3 matrix run and documented. Sparse-payload viability established **before** anything depends on it. |
| M1 | Picker + computed styles | Any element selectable incl. open shadow roots; flat searchable list. |
| M2 | Cascade engine | Full provenance: winners, overrides, inheritance, UA-default filtering, cross-origin refetch. Unit-tested. |
| M3 | State engine | Static detection + on-demand forcing for hover/focus/active + attribute states; ancestor and sibling triggers; diff view; clean teardown. |
| M4 | Figma mapping panel | Registry covers §8.2; side-by-side view with fidelity grades and loss summary. |
| M5 | Property copy | Single and multi-property payloads applying via `Cmd+Opt+V` in both browsers. Safari sanitization verified. |
| M6 | Element copy | Full subtree node payload pasting via `Cmd+V`. Both layout modes. Assets embedded. |
| M7 | Fidelity pass | Visual diff harness green on the fixture corpus. |

M0.5 moves to the front because the clipboard decision is now load-bearing for the whole product. M1–M4 are the daily-use tool. M5 is the highest-value export step and cheaper than M6 — build it first.

---

## 11. Verification

**Clipboard probe (M0.5).** The §9.3 matrix, run manually and recorded. Repeat after any Figma release that breaks the payload; it doubles as the regression test for schema drift.

**Cascade oracle.** Cross-check every resolved value against `getComputedStyle`, which is always correct. Any disagreement is an engine bug. Free, continuous, and worth running in production rather than only in tests.

**State engine oracle.** `:focus` is the one genuinely triggerable state — compare the class-substitution result against a real `element.focus()` and assert agreement. Divergence indicates a substitution bug presumably also affecting `:hover` and `:active`, where no ground truth exists.

**Page-cleanliness test.** Snapshot `outerHTML` and the injected-sheet list before and after cycling through every detected state on a fixture; assert byte-identical.

**Visual diff harness (M7).** Screenshot the element, paste the payload into Figma, render, pixel-diff. Report mean and max per-pixel delta plus bounding-box drift.

**Fixture corpus:** 15–20 real elements as static HTML — a card with gradient and shadow; a flex navbar; a CSS Grid dashboard tile; a shadow-DOM web component; a button with `::after` decoration and a hover transition; a `backdrop-filter` glass panel; a form input with `:focus-visible`, `:invalid`, and `:placeholder-shown` rules; a `[data-state]` component; a tight-`line-height` text block.

---

## 12. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Kiwi schema changes break all export | **High** — no plugin fallback anymore | Isolate in `fig-clipboard`; author by diff from committed fixtures (§9.2); treat the probe matrix as a regression suite. Accept that a Figma release can break export until patched. |
| Cascade reimplementation has subtle bugs | High | `getComputedStyle` oracle, run continuously. |
| Sparse property payloads clobber unrelated properties | High | M0.5 probe before building on it. Fallback: coarser all-properties copy. |
| State forcing leaves artifacts on the page | Medium | Reserved prefix, teardown on every exit path, `MutationObserver` watchdog, clones for attribute states. One active state keeps the surface small. |
| Safari clipboard sanitization | Medium | Attribute-wrapped markers. Verify at M5. |
| Safari gesture-synchronous write requirement | Medium | Pre-compute payloads on selection and state change; click handler only writes. |
| Wrong-state copies | Medium | Persistent banner while a non-default state is active; state named in every copy toast. |
| Missing fonts discovered only after paste | Medium | Manually maintained known-fonts list; warn pre-copy. |
| Safari unsigned-extension expiry | Medium | Decide at M0. |
| Gradient transform math | Medium | Isolate in `core`, unit-test against known-good matrices. |
| Cross-origin stylesheet refetch fails | Medium | Degrade gracefully: computed value with `source: unknown`. |
| JS-driven states missed | Low | Class substitution only catches CSS-declared states. Best-effort synthetic-event probing if it becomes annoying. |
| Closed shadow roots / cross-origin iframes | Low | Unfixable. Explicit UI state. |

---

## 13. Open questions

1. Does the §9.3 sparse-payload probe pass for `effects`, `fillPaints`, and `cornerRadius` independently, or only in bulk?
2. Faithful vs. Editable — is one so clearly better in practice that the toggle is unnecessary?
3. Should the mapping registry encode the Figma version it targets? Grid support is evolving and mappings will rot.
4. Is pseudo-element materialization (turning `::before` into a real layer) worth the layer noise?
5. Should state chips remember the last-selected state across element selections? Inspecting six buttons' hover styles in a row is a plausible pattern.
6. Worth persisting inspected elements locally, so two elements' styles can be compared side by side?
