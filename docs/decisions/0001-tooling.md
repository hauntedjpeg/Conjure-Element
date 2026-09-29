# 0001: Tooling and platform findings

Status: accepted, Session 1.

## Choices

| Area | Choice | Why |
|---|---|---|
| Monorepo | pnpm workspaces, source-only `core` and `fig-clipboard` | No build step between packages |
| Extension build | WXT 0.21 | Per-browser manifests and a Safari MV3 target |
| Overlay mount | Hand-written `mountOverlay()`, not WXT's `createShadowRootUi` | Exact control over what enters the page DOM, which the cleanliness test depends on |
| UI | Preact | Small enough to inject into pages |
| Kiwi codec | `@figit/fig-kiwi` 0.2.0 for reading and `KiwiWriter`; our own schema-parameterised encoder | See below |
| Lint and format | Biome | One tool |
| Tests | Vitest (Node and browser mode), Playwright for the extension | No jsdom: its CSSOM is too weak to test a cascade engine |
| TypeScript | 6.0.x | 7.x is current but untested with this toolchain |

## Findings

### The bundled Kiwi schema lags Figma's

`@figit/fig-kiwi` bundles a schema with 583 types. A payload copied from
Figma at the same header version (106) embeds a schema with 626. The header
version therefore does not identify the schema.

Kiwi encoders walk the schema's field list, so a field the schema does not
name is dropped without error. Consequences, both implemented:

- `encodeWithSchema()` encodes against an explicit schema, normally the one
  embedded in a captured payload. Templates carry their own schema.
- `validateMessage()` reports every field an encode would drop.

### Figit's envelope is not byte-shaped like Figma's

Figit wraps the spans in a `<div>`; Figma writes bare sibling spans and a
trailing text span. `composeEnvelope()` supports both as `figit` and
`figma-exact`, and the probe compares them.

### What a content script can do with page stylesheets (Chromium)

Pinned as tests in `e2e/spike-worlds.spec.ts`. From the extension's isolated
world:

| Capability | Result |
|---|---|
| Read rules from `<style>` sheets | Works |
| Read rules from sheets the page constructed and adopted | Works |
| Reach an open shadow root and its adopted sheets | Works |
| Construct a sheet, adopt it on the document, remove it again | Works, and the page's view of its adopted sheets is unchanged afterwards |
| Edit `selectorText` in place on `<style>`, page-constructed and shadow sheets | Works, takes effect immediately, restores exactly |
| `replaceSync()` on refetched text yields typed rules (`CSSLayerBlockRule`, `CSSMediaRule`) | Works |

**Not verified in Safari.** These cannot be automated there. The overlay
already falls back to a `<style>` element if adoption fails.

### Testing the production build

`chrome.action.onClicked.dispatch(tab)` fires the real toolbar event from the
service worker, so the production build is tested as shipped. The e2e build
exists only because a closed shadow root is unreachable to tests.

### macOS pasteboard

`osascript` can read `NSPasteboard` directly, including representations the
web clipboard API never exposes. This is the primary capture path for the
probe.

## Unverified

- `safari-web-extension-converter` flags in `scripts/safari-generate.sh` are
  written from Apple's documentation. The tool could not be run because the
  Xcode licence was not accepted at the time.
- Whether Safari runs the WXT-built MV3 service worker reliably.
