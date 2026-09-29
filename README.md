# Conjure Element

A browser extension for replicating web UI in Figma. Select an element, see
every resolved CSS property with its provenance, force an interaction state,
and copy the result to Figma through the clipboard.

Chrome and Safari. No Figma plugin.

**Status:** M1. Pick any element, including inside open shadow roots and
frames, and see its computed styles with UA defaults hidden. Provenance,
states, Figma mapping and copy are still to come. See
[docs/ROADMAP.md](docs/ROADMAP.md).

## Layout

```
packages/
  core/           Cascade, state and mapping engines. No extension APIs.
  fig-clipboard/  Figma clipboard payloads: envelope, Kiwi codec, builders.
  extension/      MV3 extension: worker, content scripts, overlay UI.
  safari/         Xcode wrapper, generated once by `pnpm safari:generate`.
fixtures/         Static HTML pages the tests inspect.
e2e/              Playwright tests that load the built extension.
docs/             Roadmap, decisions, probe protocol, Safari checklist.
```

`core` and `fig-clipboard` must not depend on extension APIs. `pnpm purity`
enforces it.

## Setup

```bash
pnpm install
```

```bash
pnpm exec playwright install chromium webkit
```

## Commands

| Command | What it does |
|---|---|
| `pnpm build` | Build the extension for Chromium into `packages/extension/.output/chrome-mv3` |
| `pnpm build:safari` | Build for Safari into `.output/safari-mv3` |
| `pnpm test` | Unit tests, in Node |
| `pnpm test:browser` | Engine tests, in Chromium and WebKit |
| `pnpm e2e` | Build, then run the extension tests in Chromium |
| `pnpm typecheck` | Type-check every package |
| `pnpm lint` | Biome lint and format check |
| `pnpm purity` | Check that the pure packages stay pure |
| `pnpm probe` | Serve the clipboard probe page on port 5179 |
| `pnpm probe:capture <name>` | Save what Figma put on the macOS clipboard |

## Loading the extension

**Chromium browsers.** Run `pnpm build`, open the extensions page, enable
developer mode, choose *Load unpacked*, and pick
`packages/extension/.output/chrome-mv3`.

**Safari.** See [docs/safari/MANUAL-CHECKLIST.md](docs/safari/MANUAL-CHECKLIST.md).

## Using it

Click the toolbar button, then click an element. The panel lists what
differs from the browser's defaults; tick *Show all computed* for the rest.

| Key | Does |
|---|---|
| `↑` / `↓` | Parent / first child |
| `←` / `→` | Previous / next sibling |
| `Esc` | Exit |

The arrow button in the panel header starts picking again.

## Clipboard probe

Before property copy can be designed, Figma's handling of authored payloads
has to be observed. Follow [docs/probe/PROTOCOL.md](docs/probe/PROTOCOL.md).
