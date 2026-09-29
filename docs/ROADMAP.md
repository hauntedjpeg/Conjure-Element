# Roadmap

Source of truth for requirements is the PRD. This file tracks how the
milestones are split into sessions, and where each one stands.

| # | Scope | Exit criteria | Status |
|---|---|---|---|
| S1 | Scaffold, **M0** overlay, **M0.5** probe harness, core selector foundations | Overlay toggles in Chromium under test; probe harness runs | Built. Safari wrapper and the probe run are waiting on manual steps |
| S2 | **M1** picker: box-model bands, label, composed-tree breadcrumb, arrow keys, shadow piercing, frame relay and badges, computed-styles panel with UA-baseline filter, categories, search | Picker e2e green on shadow and frame fixtures | |
| S3 | **M2a** cascade: collect, conditions, layers, match, sort, resolve, shorthand provenance, inline, presentational attributes, inheritance, oracle | Oracle reports zero mismatches on cascade fixtures | |
| S4 | **M2b** shadow selectors, cross-origin refetch with `@import` and URL rebasing, `@scope`, `var()` chains, pseudo-element tab, inactive rules, override-stack UI, rule indexing | Oracle clean on corpus; large-sheet fixture within budget | |
| S5 | **M3** states: detect, triggers, in-place rewrite, clones, registry, watchdog, diff view, transition metadata, chips, banner | `:focus` oracle passes; cleanliness test byte-identical | |
| S6 | **M4** mapping registry, all PRD §8.2 mappings, gradient matrix, Figma columns, fidelity indicator, summary strip, filter chips | Every mapping unit-tested | |
| S7 | **M5** property copy, designed from the probe results | e2e reads back and decodes the clipboard; pastes in Figma from both browsers | Blocked on probe results |
| S8 | **M6** element copy: IR, Faithful / Editable layout, images, text, known-fonts list, copy report, state naming | Decoded payload matches IR snapshots | |
| S9 | **M7** visual diff harness, full fixture corpus | Diff ratios recorded, baseline ratchet in place | |

S2 to S6 do not depend on the probe results. S6 is largely independent of S5.

## Design notes carried into later sessions

- **Cascade order** extends the PRD's list: origin and importance → tree
  context → inline → layer → specificity → `@scope` proximity → source order.
  `!important` reverses origin, context and layer order.
- **Core seam.** The collector turns CSSOM into plain `RuleRecord` data.
  Everything after that is pure and tested in Node. DOM-facing modules take
  DOM objects plus a `CascadeHost`, and find their window through
  `el.ownerDocument.defaultView`, which is what makes iframes work.
- **Frames.** Frame 0 owns the panel and the active state. Each frame owns
  its own highlight layer. Selections in child frames travel to frame 0 as
  serialisable DTOs through the worker. Clipboard writes happen in frame 0.
- **Encoding runs in the worker.** `@figit/fig-kiwi` is about 566 KB, mostly
  schema. It must not be in a script injected into every frame.
- **Payload cache** keyed by element, state, layout mode and kind. Stores
  strings. Rebuilt on selection, state or mode change. Click handlers only
  write.
- **Text nodes** may need `derivedTextData` (glyph layout). Unverified; test
  with a text node that omits it before adding a font-parsing dependency.
