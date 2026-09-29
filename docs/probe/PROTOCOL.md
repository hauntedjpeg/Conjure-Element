# Clipboard probe protocol (M0.5)

The whole export path depends on what Figma does with a clipboard payload we
wrote ourselves. This protocol answers that before anything is built on it.
It takes about 20 minutes. Record every outcome in [RESULTS.md](RESULTS.md).

Re-run it after any Figma release that breaks pasting. It doubles as the
regression test for schema drift.

## What is already known

- A plain Figma copy is `text/html` holding two spans: `data-metadata`
  (base64 JSON) and `data-buffer` (base64 `fig-kiwi` binary).
- Other tools paste node payloads into Figma from a browser with no plugin.
- **Nothing public describes the "Copy properties" payload.** Whether ⌘⌥C
  even writes to the system clipboard is unknown. Step 2 finds out.

## Setup

1. In Figma, create a scratch file with two rectangles.

   | | Rect A (source) | Rect B (target) |
   |---|---|---|
   | Fill | red `#FF0000` | green `#00C853` |
   | Stroke | 2 px blue, inside | none |
   | Corner radius | 12 | 0 |
   | Effect | drop shadow | inner shadow |
   | Opacity | 80% | 100% |

2. B is the clobber target. **Duplicate B before every paste** and paste onto
   the duplicate, so each probe starts from the same known state.
3. In a terminal at the repo root, run `pnpm install` if you have not already.

## Step 1: baseline inside Figma (T0)

Select A, press ⌘C. Select a duplicate of B, press ⌘⌥V.

This establishes whether a **normal node copy** can be pasted as properties.
If it can, a node payload can act as a property carrier even if ⌘⌥C turns out
to be unreachable.

## Step 2: capture real payloads

Run each pair of commands around the Figma action. The change counter tells
you whether Figma touched the system clipboard at all.

**C1, Copy properties**

```bash
pnpm probe:changecount
```

Select A in Figma and press ⌘⌥C. Then:

```bash
pnpm probe:changecount
```

```bash
pnpm probe:capture C1
```

**C2, single property.** In Figma's right sidebar, click the Fill row of A so
only that property is selected, press ⌘C, then:

```bash
pnpm probe:capture C2
```

**C3, plain copy.** Select A, press ⌘C, then:

```bash
pnpm probe:capture C3
```

Each capture prints a summary and writes
`packages/fig-clipboard/fixtures/captured/<name>/`. Compare the three
summaries: `dataType`, the message keys, and the fields on the content node
are where a properties payload would differ from a node payload.

If a capture reports **no Figma payload**, that is a finding, not a failure.
Record it; the raw pasteboard representations are still saved under `raw/`.

## Step 3: paste authored payloads

```bash
pnpm probe
```

Open <http://localhost:5179> in your Chromium browser.

1. Press **clipboard.write** on row **N1**, switch to Figma, press ⌘V.
2. For **P1 to P5**, press **clipboard.write**, select a fresh duplicate of B
   in Figma, press ⌘⌥V. After each, note for every property of B whether it
   is *unchanged*, *replaced*, or *reset to default*.
3. Under **Capture**, choose **Load captured fixture** and pick
   `fixtures/captured/C1/public.html`. Set **Source** to *captured template*.
4. Run **R1**, **R2**, and **P1 to P5** again. These are now derived from
   Figma's own payload instead of the synthetic rectangle.
5. If any row fails, retry it with the **copy event** button and with the
   **figit** envelope. Record which combination works.

## Step 4: Safari

Open <http://localhost:5179> in Safari and repeat **N1** and **R1** with both
write buttons. This is the check that the markers survive WebKit's clipboard
sanitiser.

## Step 5: record and keep

Fill in [RESULTS.md](RESULTS.md). The captured fixtures under
`packages/fig-clipboard/fixtures/captured/` become the templates for property
copy, so keep them with the results.

## Reading the outcome

| Outcome | What it means for property copy (M5) |
|---|---|
| C1 is a `fig-kiwi` payload, R1 pastes, sparse probes leave other properties alone | The design in the PRD holds: sparse payloads cloned from the C1 template |
| Sparse probes reset unrelated properties | Try the C2 single-property format; failing that, a dense all-properties copy with a warning |
| ⌘⌥C never changes the clipboard, but T0 works | A property payload is a node payload used as a carrier |
| Neither works | Paste a named carrier rectangle with ⌘V, then use Figma's own copy and paste properties from it |
| **clipboard.write** fails but **copy event** works | The extension uses the copy-event path everywhere |
| R1 works but R2 does not | Our encoder or schema differs; fix before building further |
| N1 fails in Safari only | Compare envelope variants, then prefer the copy-event path in Safari |
