# 0002: Force states by editing selectors in place

Status: accepted. Deviates from PRD §7.3.

## Problem

The PRD forces a state by copying the relevant rules into a new stylesheet,
with the pseudo-class swapped for a marker class, appended after the author
sheets. Swapping a pseudo-class for a class preserves specificity. It does
not preserve **source order**: the copied rule is now last.

```css
.box:hover  { color: red }   /* forced copy lands after the next rule */
.box.active { color: blue }  /* equal specificity, later: wins under a real hover */
```

Under a real hover on `.box.active` the text is blue. With an appended copy
it is red. Equal-specificity ties like this are common in component CSS.

## Decision

For any sheet readable through the CSSOM, edit the rule where it stands:

```
.box:hover   →   .box:hover, .box.__insp-hover
```

Source order, cascade layer, and enclosing `@media` / `@supports` /
`@container` conditions are all preserved because the rule never moves. The
original `selectorText` is recorded in the artifact registry and written back
on teardown.

An appended constructed sheet is used only where the rule cannot be edited:
cross-origin sheets, whose rules we hold as a refetched copy. Results from
that path are marked as order-uncertain in the panel.

## Evidence

`e2e/spike-worlds.spec.ts`, "editing selectorText in place forces a state and
preserves source order", asserts the blue-wins case above from the content
script's world, and that the selector and computed style are restored
exactly.

## Costs

- The page's own stylesheet objects are mutated while a state is forced. A
  page that reads its rules' `selectorText` during that window sees the
  marker. One state at a time keeps the window and the surface small.
- Teardown must restore text exactly, so the page-cleanliness test compares
  rule text before and after, not only the DOM.
