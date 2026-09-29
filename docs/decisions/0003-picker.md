# 0003: Picker

Status: accepted, Session 2. Deviates from PRD §5.2 and §5.3.

## Decisions

| Topic | Decision |
|---|---|
| Hit testing | A shield over the viewport while picking, and `elementsFromPoint` beneath it. Not `composedPath()` |
| Frames | Every frame the extension can inject into is inspectable, cross-origin included |
| Closed shadow roots | Reported, never entered, in every browser |
| Frame to element mapping | Learned from the pointer and a probe through the worker. No `postMessage` |
| UA baseline | One standards-mode frame per document, inside the overlay's shadow root |
| Selection trigger | `click`, not `pointerdown` |
| "Authored" in M1 | Differs from the UA baseline. Labelled **non-default** |

## The shield

The PRD resolves the target from `composedPath()[0]` on pointer events. That
requires the pointer to reach the page, which puts the element under it in
`:hover`. Its styles would then be read in the hover state and shown as the
default state. The same values feed the cascade oracle and the default-state
cache that the state engine diffs against.

So while picking, a transparent element covers the viewport and takes the
pointer. The page sees no pointer at all.

What this also fixes:

- Disabled controls, which swallow pointer events in some engines
- Text selection and drag starts
- Links and click handlers, without having to cancel events the page may
  already have seen

What it costs:

- **Elements that only exist on hover cannot be picked by pointer.** They
  are reachable by arrow keys and breadcrumb, and by forcing the state once
  the state engine exists.
- A shield does not scroll, so wheel events are forwarded by hand to the
  scroller beneath the pointer. The document itself scrolls natively.

Selection happens on `click`. On `pointerdown` the shield would be gone
before the matching `click` fired, and the page would receive it.

## Frames

The PRD calls cross-origin frames uninspectable. That assumes the top frame
reaches into child documents. With one inspector per frame and a relay
through the worker, the origin of a frame makes no difference, so there is
nothing to exclude.

Found by test: `data:` documents are injected too. What refuses injection is
the browser's own error page, which is what a blocked or unreachable frame
shows. An `executeScript` call with `allFrames` skips such frames and
succeeds for the rest.

### How a document learns which frame element holds which frame

A content script does not know its own frame ID, and a document cannot see
into a cross-origin child. `postMessage` would answer both, but the page can
observe it. Instead:

1. When the pointer reaches a frame element, the shield steps aside. The
   child's shield takes the pointer and the child broadcasts a **claim**.
2. The parent takes the frame element the page reports as `:hover` and
   checks that it fits the claim: same viewport size, and same name where
   the element has one. If it fits, the two are linked.
3. For a frame it cannot see into and has not linked, the parent sends a
   **probe** with those traits. Any frame that fits answers. No answer in
   400 ms means the frame refused injection.

Same-origin frames need none of this: the parent looks for the overlay
element in the child document.

Limits:

- A frame that cannot answer is taken for one that can if another frame of
  the same size and name answers. It then cannot be picked by pointer, only
  by keyboard. The opposite mistake would put a frame's content out of
  reach, so a frame counts as inspectable until it has failed to answer.
- A frame that accepts injection cannot be selected as an element by
  pointer, because the pointer passes through to its content. Use Up from
  inside it, or the frame crumb.
- Up and Down cross a frame boundary only once the pointer has been inside
  that frame.

## Closed shadow roots

`chrome.dom.openOrClosedShadowRoot` works from a content script and would
allow closed roots to be inspected in Chromium. Safari has no equivalent.
To keep both browsers alike, the API is used only to **detect** a closed
root.

Where the API is missing, detection is a guess from rendering: a custom
element with no open root that either has light DOM of which none is
rendered, or has no light DOM and still takes up space. The panel says
"may have". A closed root that slots all of its light DOM cannot be told
from no root at all.

## UA baseline

| Finding | Chromium | WebKit |
|---|---|---|
| Computed styles are available in a zero-size, `visibility: hidden` frame | Yes | Yes |
| A blank frame is in quirks mode until a doctype is written | Yes | Yes |
| `document.write` of a doctype takes effect synchronously | Yes | Yes |
| A frame inside a shadow root counts towards `window.length` | **No** | **No** |
| A frame inside a shadow root is reachable by name | No | No |
| A disconnected element has computed styles | No | No |

So the baseline frame lives in the overlay's shadow root, where the page can
neither count it nor find it.

The bootstrap content script and `executeScript` both reach the baseline
frame. Both decline to run there.

The baseline is always standards mode. On a quirks-mode page a few defaults
will differ.

### What "non-default" means until Session 3

Without matched rules, a property is non-default when its computed value
differs from the baseline. Consequences:

- Inherited values are listed, because they differ from the baseline.
- Logical properties are dropped where the physical ones are listed.
- Colours that follow the text colour in both the element and the baseline
  count as default. An author who sets `border-color` to the same value as
  `color` will not see it listed.
- `transform-origin` and `perspective-origin` are hidden unless a transform
  or perspective is in effect.
- `width`, `height`, margins and insets are resolved by layout. They are
  listed and tagged **used**.
- Custom properties are not enumerated by computed styles. Session 4.

Pinned by a test: a bare element in an unstyled document reports nothing
beyond layout-resolved properties, for 16 tags, in both engines.

## Events the page can still observe

- Capture listeners the page registered on `window` run before the
  extension's. They see key events, and pointer events aimed at the overlay
  host. Nothing a content script can do about this.
- Focus moves into the panel when it is clicked, so the page sees a blur.

Events that bubble out of the overlay are stopped at its root. Keys pressed
in the panel are stopped at the window, in the capture phase, so the panel
itself cannot use key handlers; the search box works from `input` events.

## Known gaps

- Modal dialogs, popovers and fullscreen elements render in the top layer,
  above the overlay.
- A selection made by keyboard or breadcrumb is read in whatever state the
  pointer has left the page in.
- The box-model bands are axis-aligned. On a transformed element the inner
  bands are approximate.

## Injection

`executeScript` waits for every targeted frame to finish loading unless
`injectImmediately` is set. One slow frame would hold up the toolbar button,
so it is set, with a fallback for browsers that reject the option. An
inspector that arrives before the document element exists does nothing.

## Test environment

The extension tests run a headed Chromium. With the display asleep, whole
batches of tests stalled for minutes and failed on timeouts, including
tests that touch none of this code. Chromium logged
`CVDisplayLinkCreateWithCGDisplay failed`. Run the suite with the display
awake.
